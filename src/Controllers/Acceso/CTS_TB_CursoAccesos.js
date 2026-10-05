/* Benjamin Orellana - 05/10/2026 - Gestión manual de asignaciones de cursos. */
import { Op, literal } from 'sequelize';
import db from '../../DataBase/db.js';
import Accesos from '../../Models/Acceso/MD_TB_CursoAccesos.js';
import Usuarios from '../../Models/Usuario/MD_TB_Usuarios.js';
import Clientes from '../../Models/Cliente/MD_TB_Clientes.js';
import Cursos from '../../Models/Curso/MD_TB_Cursos.js';
import Excepciones from '../../Models/Acceso/MD_TB_CursoAccesoLecciones.js';
import { controlador } from '../../utils/http.utils.js';
import { id, opcion, camposPermitidos, exigir, bandera } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { conAuditoria } from '../../Services/Sistema/auditoria.service.js';
import { alcances, estados, opcionesTx, motivo, datosAcceso, contextoAsignacion, excepcionesAcceso, validarDestino,
  validarSeleccion, validarOtorgamiento, reemplazarLecciones, snapshot, guardarHistorial, modificarAcceso } from '../../Services/Acceso/gestionAcceso.service.js';
import { ahoraDB, fechaUTC, estadosTemporales, sqlEstadoTemporal } from '../../Services/Acceso/permisoAcceso.service.js';

export const OBRS_CursoAccesos_CTS = controlador(async req => {
  const query = consulta(req.query, ['usuario_id', 'curso_id', 'estado', 'alcance', 'estado_temporal', 'vence_desde', 'vence_hasta']), where = {};
  for (const key of ['usuario_id', 'curso_id']) if (query[key] !== undefined) where[key] = id(query[key], key);
  if (query.estado !== undefined) where.estado = opcion(query.estado, 'estado', estados);
  if (query.alcance !== undefined) where.alcance = opcion(query.alcance, 'alcance', alcances);
  if (query.estado_temporal !== undefined) where[Op.and] = literal(`(${sqlEstadoTemporal}) = ${db.escape(opcion(query.estado_temporal, 'estado_temporal', estadosTemporales))}`);
  const from = query.vence_desde === undefined ? null : fechaUTC(query.vence_desde, 'vence_desde');
  const to = query.vence_hasta === undefined ? null : fechaUTC(query.vence_hasta, 'vence_hasta');
  exigir(!from || !to || to > from, 422, 'VENTANA_INVALIDA', 'vence_hasta debe ser posterior a vence_desde.');
  if (from || to) where.vence_en = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lt]: to } : {}) };
  const q = busqueda(query.q);
  if (q) where[Op.or] = ['$usuario.nombre$', '$usuario.email$', '$curso.titulo$'].map(field => ({ [field]: { [Op.like]: `%${q}%` } }));
  return listar(Accesos, query, { where, attributes: { include: [[literal(sqlEstadoTemporal), 'estado_temporal']] },
    include: [{ model: Usuarios, as: 'usuario', attributes: ['id', 'cliente_id', 'nombre', 'email', 'estado', 'rol'], required: false },
      { model: Cursos, as: 'curso', attributes: ['id', 'titulo', 'estado'], required: false }] },
    ['id', 'inicio_en', 'vence_en', 'creado_en', 'actualizado_en'], 'id');
});
export const OBRS_DetCursoAcceso_CTS = controlador(async req => {
  const row = await Accesos.findByPk(id(req.params?.id), { include: [
    { model: Usuarios, as: 'usuario', attributes: ['id', 'cliente_id', 'nombre', 'email', 'rol', 'estado'],
      include: [{ model: Clientes, as: 'cliente', attributes: ['id', 'nombre', 'activo'], required: false }], required: false },
    { model: Cursos, as: 'curso', attributes: ['id', 'titulo', 'estado'], required: false },
    { model: Usuarios, as: 'asignador', attributes: ['id', 'nombre'], required: false }
  ] });
  exigir(row, 404, 'NO_ENCONTRADO', 'Asignación no encontrada.');
  return { data: { ...row.get({ plain: true }), estado_temporal: (await db.query(
    `SELECT (${sqlEstadoTemporal}) AS estado_temporal FROM curso_accesos WHERE id = ?`,
    { replacements: [row.id], type: 'SELECT' }))[0].estado_temporal,
    lecciones: await excepcionesAcceso(row) } };
});
export const CR_CursoAcceso_CTS = controlador(async (req, actor) => {
  const input = datosAcceso(req.body, true);
  const data = await conAuditoria(req, actor, 'ACCESO_ASIGNADO', 'curso_accesos', async transaction => {
    const context = await contextoAsignacion(input.data.usuario_id, input.data.curso_id, transaction);
    validarDestino(context);
    const existente = await Accesos.findOne({ where: { usuario_id: context.usuario.id, curso_id: context.curso.id }, transaction, lock: transaction.LOCK.UPDATE });
    exigir(!existente, 409, 'ACCESO_EXISTENTE', 'La asignación ya existe. Renovar o modificar la misma fila.');
    const now = await ahoraDB(transaction), values = { alcance: 'COMPLETO', inicio_en: now, vence_en: null,
      ...input.data, estado: 'ACTIVO', asignado_por: actor.id }, rows = input.lecciones ?? [];
    await validarOtorgamiento(context, values, rows, now, transaction);
    const row = await Accesos.create(values, { transaction });
    await reemplazarLecciones(row, rows, transaction);
    const after = await snapshot(row, transaction, now);
    await guardarHistorial(row, actor, 'ASIGNADO', null, after, input.motivo, transaction);
    return { entidadId: row.id, data: after, detalle: { curso_id: String(row.curso_id), usuario_id: String(row.usuario_id), alcance: row.alcance } };
  }, opcionesTx);
  return { status: 201, message: 'Curso asignado correctamente.', data };
});
export const UR_CursoAcceso_CTS = controlador(async (req, actor) => {
  const input = datosAcceso(req.body), fecha = input.data.inicio_en !== undefined || input.data.vence_en !== undefined;
  const accion = fecha ? 'RENOVADO' : input.lecciones !== undefined ? 'LECCION_MODIFICADA' : 'ALCANCE_MODIFICADO';
  const data = await modificarAcceso(req, actor, accion, input.motivo, async (context, before, now, transaction) => {
    const merged = { ...before, ...input.data }, rows = input.lecciones ?? before.lecciones;
    const permiso = fecha || input.data.alcance !== undefined || input.lecciones !== undefined;
    // Quitar la última selección corta acceso; nunca convierte una selección vacía en curso completo.
    const automatico = before.estado === 'ACTIVO' && before.alcance === 'SELECCION' && merged.alcance === 'SELECCION'
      && input.lecciones !== undefined && !rows.some(row => row.estado === 'HABILITADA');
    if (automatico) merged.estado = 'SUSPENDIDO';
    if (permiso) {
      validarSeleccion(merged, rows);
      if (merged.estado === 'ACTIVO' && (fecha || input.data.alcance !== undefined)) await validarOtorgamiento(context, merged, rows, now, transaction);
      else if (rows.some(row => row.estado === 'HABILITADA') && input.lecciones !== undefined) validarDestino(context);
    }
    await context.acceso.update({ ...input.data, ...(automatico ? { estado: 'SUSPENDIDO' } : {}) }, { transaction });
    if (input.lecciones !== undefined) await reemplazarLecciones(context.acceso, rows, transaction);
    return { campos: Object.keys(input.data), ...(input.lecciones !== undefined ? { lecciones_reemplazadas: true } : {}),
      ...(automatico ? { suspension_por_seleccion_vacia: true } : {}) };
  });
  return { message: 'Asignación actualizada correctamente.', data };
});
export const RENOVAR_CursoAcceso_CTS = controlador(async (req, actor) => {
  const input = camposPermitidos(req.body, ['inicio_en', 'vence_en', 'restablecer_fechas_lecciones', 'motivo']);
  exigir(input.vence_en !== undefined, 422, 'VENCIMIENTO_REQUERIDO', 'Indicar vence_en; null permite acceso sin vencimiento.');
  const values = { estado: 'ACTIVO', vence_en: fechaUTC(input.vence_en, 'vence_en', true) };
  if (input.inicio_en !== undefined) values.inicio_en = fechaUTC(input.inicio_en, 'inicio_en');
  const reset = input.restablecer_fechas_lecciones === undefined ? false : Boolean(bandera(input.restablecer_fechas_lecciones, 'restablecer_fechas_lecciones'));
  const data = await modificarAcceso(req, actor, 'RENOVADO', motivo(input.motivo), async (context, before, now, transaction) => {
    const rows = reset ? before.lecciones.map(row => ({ ...row, inicio_en: null, vence_en: null })) : before.lecciones;
    await validarOtorgamiento(context, { ...before, ...values }, rows, now, transaction);
    await context.acceso.update(values, { transaction });
    if (reset) await Excepciones.update({ inicio_en: null, vence_en: null, actualizado_en: literal('UTC_TIMESTAMP(3)') },
      { where: { acceso_id: context.acceso.id, curso_id: context.acceso.curso_id }, transaction });
    return { restablecer_fechas_lecciones: reset };
  });
  return { message: 'Acceso renovado; el progreso se conserva.', data };
});
function estadoAcceso(target) {
  return controlador(async (req, actor) => {
    const input = camposPermitidos(req.body, ['motivo'], { vacio: true });
    const accion = { SUSPENDIDO: 'SUSPENDIDO', REVOCADO: 'REVOCADO', ACTIVO: 'REACTIVADO' }[target];
    const data = await modificarAcceso(req, actor, accion, motivo(input.motivo), async (context, before, now, transaction) => {
      exigir(!(target === 'SUSPENDIDO' && before.estado === 'REVOCADO'), 409, 'ACCESO_REVOCADO', 'Renovar o reactivar primero un acceso revocado.');
      if (target === 'ACTIVO') await validarOtorgamiento(context, { ...before, estado: target }, before.lecciones, now, transaction);
      await context.acceso.update({ estado: target }, { transaction });
      return { estado: target };
    });
    return { message: target === 'ACTIVO' ? 'Acceso reactivado.' : target === 'SUSPENDIDO' ? 'Acceso suspendido.' : 'Acceso revocado.', data };
  });
}
export const SUSPENDER_CursoAcceso_CTS = estadoAcceso('SUSPENDIDO');
export const REACTIVAR_CursoAcceso_CTS = estadoAcceso('ACTIVO');
export const ER_CursoAcceso_CTS = estadoAcceso('REVOCADO');
