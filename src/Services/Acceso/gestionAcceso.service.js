/* Benjamin Orellana - 05/10/2026 - Asignaciones, excepciones e historial transaccional. */
import { Op, Transaction, literal } from 'sequelize';
import Accesos from '../../Models/Acceso/MD_TB_CursoAccesos.js';
import Excepciones from '../../Models/Acceso/MD_TB_CursoAccesoLecciones.js';
import Historial from '../../Models/Acceso/MD_TB_CursoAccesosHistorial.js';
import Cursos from '../../Models/Curso/MD_TB_Cursos.js';
import Lecciones from '../../Models/Curso/MD_TB_CursoLecciones.js';
import Modulos from '../../Models/Curso/MD_TB_CursoModulos.js';
import Archivos from '../../Models/Archivo/MD_TB_Archivos.js';
import { id, exigir, camposPermitidos, opcion, texto } from '../../utils/validacion.utils.js';
import { serializar } from '../../utils/http.utils.js';
import { bloquearUsuario } from '../Usuario/usuarioEstado.service.js';
import { conAuditoria } from '../Sistema/auditoria.service.js';
import { bloquearArchivos, validarArchivo } from '../Archivo/archivoReferencias.service.js';
import { fechaUTC, fechaGuardada, ahoraDB, estadoTemporal, ventanaEfectiva, validarVentana, validarVentanaLeccion } from './permisoAcceso.service.js';

export const alcances = ['COMPLETO', 'SELECCION'];
export const estados = ['ACTIVO', 'SUSPENDIDO', 'REVOCADO'];
export const estadosLeccion = ['HABILITADA', 'BLOQUEADA'];
export const opcionesTx = { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED };
export function motivo(value) { return value === undefined ? null : texto(value, 'motivo', 500, { nullable: true }); }
export function datosAcceso(body, crear = false) {
  const input = camposPermitidos(body, [...(crear ? ['usuario_id', 'curso_id'] : []),
    'alcance', 'inicio_en', 'vence_en', 'observaciones_internas', 'lecciones', 'motivo']);
  const data = {};
  if (crear) { data.usuario_id = id(input.usuario_id, 'usuario_id'); data.curso_id = id(input.curso_id, 'curso_id'); }
  if (input.alcance !== undefined) data.alcance = opcion(input.alcance, 'alcance', alcances);
  if (input.inicio_en !== undefined) data.inicio_en = fechaUTC(input.inicio_en, 'inicio_en');
  if (input.vence_en !== undefined) data.vence_en = fechaUTC(input.vence_en, 'vence_en', true);
  if (input.observaciones_internas !== undefined) data.observaciones_internas = texto(input.observaciones_internas,
    'observaciones_internas', 50000, { nullable: true, byteMax: 60000 });
  const lecciones = input.lecciones === undefined ? undefined : entradasLecciones(input.lecciones);
  exigir(crear || Object.keys(data).length || lecciones !== undefined, 422, 'SIN_CAMBIOS', 'No hay cambios para guardar.');
  return { data, lecciones, motivo: motivo(input.motivo) };
}
export function entradaLeccion(value, parcial = false) {
  const input = camposPermitidos(value, ['leccion_id', 'estado', 'inicio_en', 'vence_en']);
  const row = {};
  if (input.leccion_id !== undefined) row.leccion_id = id(input.leccion_id, 'leccion_id');
  if (!parcial) { row.leccion_id = id(input.leccion_id, 'leccion_id'); row.estado = opcion(input.estado ?? 'HABILITADA', 'estado', estadosLeccion); }
  else if (input.estado !== undefined) row.estado = opcion(input.estado, 'estado', estadosLeccion);
  for (const key of ['inicio_en', 'vence_en']) if (input[key] !== undefined) row[key] = fechaUTC(input[key], key, true);
  return row;
}
export function entradasLecciones(value) {
  exigir(Array.isArray(value) && value.length <= 10000, 422, 'LECCIONES_INVALIDAS', 'lecciones debe ser una lista de hasta 10000 elementos.');
  const rows = value.map(item => ({ inicio_en: null, vence_en: null, ...entradaLeccion(item) }));
  exigir(new Set(rows.map(row => row.leccion_id)).size === rows.length, 422, 'LECCIONES_DUPLICADAS', 'No repetir una lección en la selección.');
  return rows.sort((a, b) => BigInt(a.leccion_id) < BigInt(b.leccion_id) ? -1 : 1);
}
export async function contextoAsignacion(usuarioId, cursoId, transaction) {
  // Cliente -> usuario -> curso -> acceso -> excepciones. El curso también serializa cambios de contenido.
  const { user, cliente } = await bloquearUsuario(usuarioId, transaction);
  const curso = await Cursos.findByPk(id(cursoId, 'curso_id'), { transaction, lock: transaction.LOCK.UPDATE });
  exigir(curso, 404, 'NO_ENCONTRADO', 'Curso no encontrado.');
  return { usuario: user, cliente, curso };
}
export async function contextoAcceso(value, transaction) {
  const key = id(value), lookup = await Accesos.findByPk(key, { attributes: ['id', 'usuario_id', 'curso_id'], transaction });
  exigir(lookup, 404, 'NO_ENCONTRADO', 'Asignación no encontrada.');
  const context = await contextoAsignacion(lookup.usuario_id, lookup.curso_id, transaction);
  const acceso = await Accesos.findByPk(key, { transaction, lock: transaction.LOCK.UPDATE });
  exigir(acceso && String(acceso.usuario_id) === String(lookup.usuario_id) && String(acceso.curso_id) === String(lookup.curso_id),
    409, 'CONCURRENCIA', 'La asignación cambió. Reintentá.');
  return { ...context, acceso };
}
export function validarDestino(context) {
  exigir(context.usuario.rol === 'ALUMNO' && ['ACTIVO', 'PENDIENTE'].includes(context.usuario.estado)
    && context.cliente?.activo === 1, 422, 'ALUMNO_INVALIDO', 'Elegir un alumno activo o pendiente con ficha comercial activa.');
  exigir(context.curso.estado === 'PUBLICADO', 422, 'CURSO_NO_PUBLICADO', 'Publicar el curso antes de asignar, renovar o reactivar.');
}
export async function excepcionesAcceso(acceso, transaction) {
  return Excepciones.findAll({ where: { acceso_id: acceso.id, curso_id: acceso.curso_id }, order: [['leccion_id', 'ASC']], transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
}
export function validarSeleccion(acceso, rows) {
  validarVentana(acceso);
  for (const row of rows) validarVentanaLeccion(row, acceso);
  exigir(acceso.estado !== 'ACTIVO' || acceso.alcance !== 'SELECCION' || rows.some(row => row.estado === 'HABILITADA'),
    422, 'SELECCION_VACIA', 'Un acceso activo por selección necesita al menos una lección habilitada. Suspendé el acceso para quitar la última.');
}
export async function validarNuevasLecciones(acceso, rows, transaction) {
  const lecciones = await Lecciones.findAll({ where: { curso_id: acceso.curso_id, id: { [Op.in]: rows.map(row => row.leccion_id) } },
    include: [{ model: Modulos, as: 'modulo', attributes: ['id', 'estado'], required: false }], transaction });
  const map = new Map(lecciones.map(row => [String(row.id), row]));
  const enabled = [];
  for (const row of rows) {
    const leccion = map.get(String(row.leccion_id));
    exigir(leccion, 422, 'LECCION_INVALIDA', 'La lección no pertenece al curso indicado.');
    validarVentanaLeccion(row, acceso);
    if (row.estado === 'HABILITADA') {
      exigir(leccion.estado === 'PUBLICADA' && leccion.modulo?.estado === 'ACTIVO' && leccion.video_archivo_id,
        422, 'LECCION_NO_PUBLICADA', 'Para habilitar un video, publicar su lección en un módulo activo.');
      enabled.push(leccion.video_archivo_id);
    }
  }
  const files = await bloquearArchivos(enabled, transaction);
  for (const value of enabled) await validarArchivo(value, 'VIDEO', files);
}
// La validación del otorgamiento permite programar videos; no exige que estén en fecha AHORA.
export async function validarOtorgamiento(context, acceso, rows, now, transaction) {
  validarDestino(context); validarSeleccion(acceso, rows);
  exigir(!acceso.vence_en || fechaGuardada(acceso.vence_en) > now, 409, 'ACCESO_VENCIDO', 'Indicar un vencimiento futuro o null para acceso sin vencimiento.');
  const candidates = await Lecciones.findAll({ where: { curso_id: acceso.curso_id, estado: 'PUBLICADA' },
    include: [{ model: Modulos, as: 'modulo', attributes: ['id'], where: { estado: 'ACTIVO' }, required: true },
      { model: Archivos, as: 'video', attributes: ['id'], where: { tipo: 'VIDEO', estado: 'DISPONIBLE' }, required: true }],
    order: [['id', 'ASC']], transaction });
  const map = new Map(rows.map(row => [String(row.leccion_id), row]));
  const future = candidates.filter(row => {
    const local = map.get(String(row.id));
    if (local?.estado === 'BLOQUEADA' || (!local && acceso.alcance === 'SELECCION')) return false;
    const window = ventanaEfectiva(acceso, local);
    return !window.vence_en || window.vence_en > now;
  });
  const files = await bloquearArchivos(future.map(row => row.video.id), transaction);
  let disponible = false;
  for (const row of future) {
    try { await validarArchivo(row.video.id, 'VIDEO', files); disponible = true; break; }
    catch (error) { if (!['ARCHIVO_INVALIDO', 'ARCHIVO_NO_DISPONIBLE'].includes(error.code)) throw error; }
  }
  exigir(disponible, 422, 'SIN_CONTENIDO_HABILITABLE', 'El acceso necesita al menos un video publicado disponible y con ventana vigente o futura.');
}
export async function reemplazarLecciones(acceso, rows, transaction) {
  await validarNuevasLecciones(acceso, rows, transaction);
  const previous = await excepcionesAcceso(acceso, transaction), wanted = new Set(rows.map(row => String(row.leccion_id)));
  for (const old of previous) if (!wanted.has(String(old.leccion_id))) await old.destroy({ transaction });
  for (const row of rows) {
    const old = previous.find(item => String(item.leccion_id) === String(row.leccion_id));
    if (old) await old.update({ estado: row.estado, inicio_en: row.inicio_en, vence_en: row.vence_en, actualizado_en: literal('UTC_TIMESTAMP(3)') }, { transaction });
    else await Excepciones.create({ ...row, acceso_id: acceso.id, curso_id: acceso.curso_id }, { transaction });
  }
}
export async function snapshot(acceso, transaction, now) {
  await acceso.reload({ transaction });
  const rows = await excepcionesAcceso(acceso, transaction);
  return { ...acceso.get({ plain: true }), estado_temporal: estadoTemporal(acceso, now ?? await ahoraDB(transaction)),
    lecciones: rows.map(row => row.get({ plain: true })) };
}
export function snapshotHistorial(value) {
  if (!value) return null;
  const { id, usuario_id, curso_id, alcance, estado, inicio_en, vence_en, asignado_por, lecciones = [] } = value;
  return serializar({ id, usuario_id, curso_id, alcance, estado, inicio_en, vence_en, asignado_por,
    lecciones: lecciones.map(({ leccion_id, estado, inicio_en, vence_en }) => ({ leccion_id, estado, inicio_en, vence_en })) });
}
export async function guardarHistorial(acceso, actor, accion, antes, despues, reason, transaction) {
  await Historial.create({ acceso_id: acceso.id, realizado_por: actor.id, accion, motivo: reason,
    datos_antes: snapshotHistorial(antes), datos_despues: snapshotHistorial(despues) }, { transaction });
}
export async function modificarAcceso(req, actor, accion, reason, operation) {
  return conAuditoria(req, actor, 'ACCESO_' + accion, 'curso_accesos', async transaction => {
    const context = await contextoAcceso(req.params?.id ?? req.params?.acceso_id, transaction);
    const now = await ahoraDB(transaction), antes = await snapshot(context.acceso, transaction, now);
    const detalle = await operation(context, antes, now, transaction);
    await context.acceso.update({ actualizado_en: literal('UTC_TIMESTAMP(3)') }, { transaction });
    const despues = await snapshot(context.acceso, transaction, now);
    await guardarHistorial(context.acceso, actor, accion, antes, despues, reason, transaction);
    return { entidadId: context.acceso.id, data: despues,
      detalle: { curso_id: String(context.acceso.curso_id), usuario_id: String(context.acceso.usuario_id), ...detalle } };
  }, opcionesTx);
}
