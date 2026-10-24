/* Benjamin Orellana - 20/10/2026 - Cronómetros por categoría con reloj del servidor. */
import { modelos as m } from '../../Models/index.js';
import { exigir, id } from '../../utils/validacion.utils.js';
import { auditarAgenda } from './agendaAcceso.service.js';
import { diaPropio } from './agendaDia.service.js';
import { categoriaAgenda, comprobarVersion, entradaAgenda, fechaArgentina, siguienteVersion,
  segundosRegistro, vistaRegistro } from './agendaDatos.service.js';

async function registroPropio(req, ctx) {
  const row = await m.agenda_tiempo_registros.findOne({ where: { id: id(req.params?.id), usuario_id: ctx.usuario.id },
    transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE });
  exigir(row, 404, 'NO_ENCONTRADO', 'El registro de tiempo no está disponible en tu agenda.');
  return row;
}
export async function iniciarTiempoAgenda(req, ctx) {
  const body = entradaAgenda(req, ['categoria']);
  const categoria = categoriaAgenda(body.categoria);
  const abierto = await m.agenda_tiempo_registros.findOne({ where: { usuario_id: ctx.usuario.id, categoria, en_curso: 1 },
    transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE });
  // Doble clic no cambia el inicio ni abre otro tramo, tampoco entre pestañas.
  if (abierto) return { creado: false, registro: vistaRegistro(abierto, ctx.ahora, ctx.acceso.vence_en) };
  const dia = await diaPropio(ctx, fechaArgentina(ctx.ahora), true);
  const row = await m.agenda_tiempo_registros.create({ usuario_id: ctx.usuario.id, dia_id: dia.id, categoria,
    inicio_en: ctx.ahora }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_TIEMPO_INICIADO', 'agenda_tiempo_registros', row.id, { categoria });
  return { creado: true, registro: vistaRegistro(await row.reload({ transaction: ctx.transaction }), ctx.ahora, ctx.acceso.vence_en) };
}
export async function detenerTiempoAgenda(req, ctx) {
  const body = entradaAgenda(req, [], { version: true });
  const row = await registroPropio(req, ctx);
  if (row.fin_en !== null) return vistaRegistro(row, ctx.ahora, ctx.acceso.vence_en);
  comprobarVersion(row, body.version);
  const segundos = segundosRegistro(row, ctx.ahora, ctx.acceso.vence_en);
  exigir(segundos <= 4294967295, 409, 'AGENDA_TIEMPO_FUERA_RANGO', 'El registro de tiempo requiere revisión.');
  await row.update({ fin_en: ctx.ahora, duracion_segundos: segundos, en_curso: null, version: siguienteVersion(row) }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_TIEMPO_DETENIDO', 'agenda_tiempo_registros', row.id, { segundos });
  return vistaRegistro(await row.reload({ transaction: ctx.transaction }), ctx.ahora, ctx.acceso.vence_en);
}
export async function eliminarTiempoAgenda(req, ctx) {
  const body = entradaAgenda(req, [], { version: true });
  const row = await registroPropio(req, ctx);
  comprobarVersion(row, body.version);
  exigir(row.fin_en !== null, 409, 'AGENDA_TIEMPO_EN_CURSO', 'Detené el cronómetro antes de eliminar su registro.');
  await row.destroy({ transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_TIEMPO_ELIMINADO', 'agenda_tiempo_registros', row.id);
  return { id: String(row.id), eliminado: true };
}
