/* Benjamin Orellana - 05/10/2026 - Selecciones y excepciones de acceso por video. */
import { literal } from 'sequelize';
import Accesos from '../../Models/Acceso/MD_TB_CursoAccesos.js';
import Excepciones from '../../Models/Acceso/MD_TB_CursoAccesoLecciones.js';
import Usuarios from '../../Models/Usuario/MD_TB_Usuarios.js';
import Clientes from '../../Models/Cliente/MD_TB_Clientes.js';
import Cursos from '../../Models/Curso/MD_TB_Cursos.js';
import Lecciones from '../../Models/Curso/MD_TB_CursoLecciones.js';
import Modulos from '../../Models/Curso/MD_TB_CursoModulos.js';
import Archivos from '../../Models/Archivo/MD_TB_Archivos.js';
import { Op } from 'sequelize';
import { controlador } from '../../utils/http.utils.js';
import { id, camposPermitidos, exigir, opcion } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { atributosArchivo } from '../../Services/Archivo/archivoReferencias.service.js';
import { entradaLeccion, motivo, validarDestino, validarNuevasLecciones, validarSeleccion, modificarAcceso } from '../../Services/Acceso/gestionAcceso.service.js';
import { ahoraDB, permisoLeccion, fechaGuardada } from '../../Services/Acceso/permisoAcceso.service.js';

export const OBRS_CursoAccesoLecciones_CTS = controlador(async req => {
  const acceso = await Accesos.findByPk(id(req.params?.acceso_id, 'acceso_id'), { include: [
    { model: Usuarios, as: 'usuario', attributes: ['id', 'cliente_id', 'rol', 'estado'],
      include: [{ model: Clientes, as: 'cliente', attributes: ['id', 'activo'], required: false }], required: false },
    { model: Cursos, as: 'curso', attributes: ['id', 'estado'], required: false }] });
  exigir(acceso, 404, 'NO_ENCONTRADO', 'Asignación no encontrada.');
  const query = consulta(req.query, ['modulo_id', 'estado']), where = { curso_id: acceso.curso_id };
  if (query.modulo_id !== undefined) where.modulo_id = id(query.modulo_id, 'modulo_id');
  if (query.estado !== undefined) where.estado = opcion(query.estado, 'estado', ['BORRADOR', 'PUBLICADA', 'ARCHIVADA']);
  const q = busqueda(query.q); if (q) where.titulo = { [Op.like]: `%${q}%` };
  const result = await listar(Lecciones, query, { where, attributes: ['id', 'curso_id', 'modulo_id', 'titulo', 'estado', 'orden', 'video_archivo_id'],
    include: [{ model: Modulos, as: 'modulo', attributes: ['id', 'curso_id', 'titulo', 'estado', 'orden'], required: false },
      { model: Archivos, as: 'video', attributes: atributosArchivo, required: false }] }, ['id', 'titulo', 'orden'], 'orden');
  const exceptions = await Excepciones.findAll({ where: { acceso_id: acceso.id, curso_id: acceso.curso_id } });
  const map = new Map(exceptions.map(row => [String(row.leccion_id), row])), now = await ahoraDB();
  return { ...result, evaluado_en: now, data: result.data.map(row => {
    const excepcion = map.get(String(row.id)) ?? null;
    return { ...row.get({ plain: true }), configuracion: excepcion,
      ...permisoLeccion(acceso, excepcion, { usuario: acceso.usuario, cliente: acceso.usuario?.cliente,
        curso: acceso.curso, modulo: row.modulo, leccion: row, video: row.video }, now) };
  }) };
});
async function editar(req, actor, eliminar = false) {
  const input = camposPermitidos(req.body, eliminar ? ['confirmar', 'motivo'] : ['estado', 'inicio_en', 'vence_en', 'motivo']);
  if (eliminar) exigir(input.confirmar === true, 422, 'CONFIRMACION_REQUERIDA', 'Indicar confirmar:true. En COMPLETO, quitar la excepción vuelve a heredar acceso.');
  const core = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'motivo'));
  const patch = eliminar ? null : entradaLeccion(core, true);
  const leccionId = id(req.params?.leccion_id, 'leccion_id');
  const data = await modificarAcceso(req, actor, 'LECCION_MODIFICADA', motivo(input.motivo), async (context, before, now, transaction) => {
    const anterior = before.lecciones.find(row => String(row.leccion_id) === leccionId);
    const leccion = await Lecciones.findOne({ where: { id: leccionId, curso_id: context.acceso.curso_id }, transaction });
    exigir(leccion, 422, 'LECCION_INVALIDA', 'La lección no pertenece al curso indicado.');
    if (eliminar) exigir(anterior, 404, 'NO_ENCONTRADO', 'La lección no tiene excepción configurada.');
    const actual = eliminar ? null : { inicio_en: null, vence_en: null, estado: 'HABILITADA', ...anterior, ...patch, leccion_id: leccionId };
    if (actual) { actual.inicio_en = fechaGuardada(actual.inicio_en); actual.vence_en = fechaGuardada(actual.vence_en); }
    const rows = [...before.lecciones.filter(row => String(row.leccion_id) !== leccionId), ...(actual ? [actual] : [])];
    const automatico = before.estado === 'ACTIVO' && before.alcance === 'SELECCION' && !rows.some(row => row.estado === 'HABILITADA');
    const merged = { ...before, ...(automatico ? { estado: 'SUSPENDIDO' } : {}) };
    validarSeleccion(merged, rows);
    // Quitar en COMPLETO amplía el permiso: validar destino si la asignación está activa.
    if (actual?.estado === 'HABILITADA' || (eliminar && merged.alcance === 'COMPLETO' && merged.estado === 'ACTIVO')) validarDestino(context);
    if (actual) await validarNuevasLecciones(merged, [actual], transaction);
    const existing = await Excepciones.findOne({ where: { acceso_id: context.acceso.id, leccion_id: leccionId, curso_id: context.acceso.curso_id },
      transaction, lock: transaction.LOCK.UPDATE });
    if (eliminar) await existing.destroy({ transaction });
    else if (existing) await existing.update({ estado: actual.estado, inicio_en: actual.inicio_en, vence_en: actual.vence_en,
      actualizado_en: literal('UTC_TIMESTAMP(3)') }, { transaction });
    else await Excepciones.create({ leccion_id: leccionId, estado: actual.estado, inicio_en: actual.inicio_en, vence_en: actual.vence_en,
      acceso_id: context.acceso.id, curso_id: context.acceso.curso_id }, { transaction });
    if (automatico) await context.acceso.update({ estado: 'SUSPENDIDO' }, { transaction });
    return { leccion_id: leccionId, excepcion_eliminada: eliminar, ...(automatico ? { suspension_por_seleccion_vacia: true } : {}) };
  });
  return { message: eliminar ? 'Excepción retirada; se aplica el alcance del curso.' : 'Permiso del video actualizado.', data };
}
export const UR_CursoAccesoLeccion_CTS = controlador((req, actor) => editar(req, actor));
export const ER_CursoAccesoLeccion_CTS = controlador((req, actor) => editar(req, actor, true));
