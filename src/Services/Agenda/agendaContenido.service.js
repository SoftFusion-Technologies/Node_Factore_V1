/* Benjamin Orellana - 20/10/2026 - Tareas, recordatorios y notas con propiedad y versiones. */
import { modelos as m } from '../../Models/index.js';
import { bandera, camposPermitidos, exigir, id } from '../../utils/validacion.utils.js';
import { auditarAgenda } from './agendaAcceso.service.js';
import { diaPropio } from './agendaDia.service.js';
import { categoriaAgenda, comprobarVersion, entradaAgenda, fechaAgenda, fechaArgentina,
  horaAgenda, siguienteVersion, textoAgenda, versionAgenda } from './agendaDatos.service.js';

const camposTarea = ['texto', 'categoria', 'hora', 'prioridad', 'recordatorio', 'completada'];

async function registroPropio(model, req, ctx) {
  const row = await model.findOne({ where: { id: id(req.params?.id), usuario_id: ctx.usuario.id },
    transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE });
  exigir(row, 404, 'NO_ENCONTRADO', 'El registro no está disponible en tu agenda.');
  return row;
}
async function devolverRegistro(row, ctx) {
  await row.reload({ transaction: ctx.transaction });
  const dia = await m.agenda_dias.findOne({ where: { id: row.dia_id, usuario_id: ctx.usuario.id }, transaction: ctx.transaction });
  return { ...row.toJSON(), fecha: dia.fecha };
}
function valoresTarea(body, row, ctx) {
  const data = {};
  for (const key of camposTarea) {
    if (body[key] === undefined) continue;
    if (key === 'texto') data.texto = textoAgenda(body.texto, 'texto', 2000);
    else if (key === 'categoria') data.categoria = categoriaAgenda(body.categoria);
    else if (key === 'hora') data.hora = horaAgenda(body.hora);
    else if (key === 'prioridad') {
      exigir([1, 2, 3].includes(body.prioridad), 422, 'PRIORIDAD_INVALIDA', 'Elegir prioridad 1, 2 o 3.');
      data.prioridad = body.prioridad;
    } else data[key] = bandera(body[key], key);
  }
  const hora = data.hora === undefined ? row?.hora : data.hora;
  const recordatorio = data.recordatorio ?? row?.recordatorio ?? 0;
  exigir(!recordatorio || hora, 422, 'RECORDATORIO_SIN_HORA', 'Para recordar una tarea indicá su hora.');
  if (data.completada !== undefined) {
    data.completada_en = data.completada ? (row?.completada_en ?? ctx.ahora) : null;
  }
  return data;
}
export async function crearTareaAgenda(req, ctx) {
  const body = entradaAgenda(req, camposTarea);
  exigir(body.texto !== undefined && body.categoria !== undefined, 422, 'DATOS_INVALIDOS', 'Indicar texto y categoría.');
  const data = valoresTarea(body, null, ctx);
  const dia = await diaPropio(ctx, fechaAgenda(req.params?.fecha), true);
  const row = await m.agenda_tareas.create({ ...data, dia_id: dia.id, usuario_id: ctx.usuario.id }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_TAREA_CREADA', 'agenda_tareas', row.id, { dia_id: String(dia.id) });
  return devolverRegistro(row, ctx);
}
export async function guardarTareaAgenda(req, ctx) {
  const body = entradaAgenda(req, [...camposTarea, 'fecha'], { version: true });
  exigir(Object.keys(body).some(key => key !== 'version'), 422, 'DATOS_INVALIDOS', 'No hay campos de tarea para guardar.');
  const row = await registroPropio(m.agenda_tareas, req, ctx);
  comprobarVersion(row, body.version);
  const data = valoresTarea(body, row, ctx);
  let cambioFecha = false;
  if (body.fecha !== undefined) {
    const dia = await diaPropio(ctx, fechaAgenda(body.fecha), true);
    cambioFecha = String(dia.id) !== String(row.dia_id);
    data.dia_id = dia.id;
  }
  if (cambioFecha || (data.hora !== undefined && data.hora !== row.hora)
    || (data.recordatorio !== undefined && data.recordatorio !== row.recordatorio)) data.recordada_en = null;
  data.version = siguienteVersion(row);
  await row.update(data, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_TAREA_ACTUALIZADA', 'agenda_tareas', row.id,
    { campos: Object.keys(body).filter(key => key !== 'version'), version: data.version });
  return devolverRegistro(row, ctx);
}
export async function eliminarTareaAgenda(req, ctx) {
  const body = entradaAgenda(req, [], { version: true });
  const row = await registroPropio(m.agenda_tareas, req, ctx);
  comprobarVersion(row, body.version);
  await row.destroy({ transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_TAREA_ELIMINADA', 'agenda_tareas', row.id);
  return { id: String(row.id), eliminada: true };
}
export async function recordarTareaAgenda(req, ctx) {
  const body = entradaAgenda(req, [], { version: true });
  const row = await registroPropio(m.agenda_tareas, req, ctx);
  if (row.recordada_en) return { ...await devolverRegistro(row, ctx), recordatorio_marcado: false };
  comprobarVersion(row, body.version);
  const dia = await m.agenda_dias.findOne({ where: { id: row.dia_id, usuario_id: ctx.usuario.id }, transaction: ctx.transaction });
  const programada = new Date(dia.fecha + 'T' + row.hora + '-03:00');
  exigir(row.recordatorio === 1 && !row.completada && row.hora
    && dia.fecha === fechaArgentina(ctx.ahora) && programada <= ctx.ahora,
  409, 'RECORDATORIO_NO_DISPONIBLE', 'El recordatorio no corresponde a una tarea pendiente de hoy que ya haya llegado a su hora.');
  await row.update({ recordada_en: ctx.ahora, version: siguienteVersion(row) }, { transaction: ctx.transaction });
  return { ...await devolverRegistro(row, ctx), recordatorio_marcado: true };
}

export async function crearNotaAgenda(req, ctx) {
  const body = entradaAgenda(req, ['texto']);
  const texto = textoAgenda(body.texto, 'texto', 4000);
  const dia = await diaPropio(ctx, fechaAgenda(req.params?.fecha), true);
  const ultima = await m.agenda_notas.findOne({ where: { usuario_id: ctx.usuario.id, dia_id: dia.id },
    transaction: ctx.transaction, order: [['orden', 'DESC'], ['id', 'DESC']] });
  const orden = ultima ? Number(ultima.orden) + 1 : 0;
  exigir(orden <= 4294967295, 409, 'AGENDA_ORDEN_AGOTADO', 'Reordená las notas antes de agregar otra.');
  const row = await m.agenda_notas.create({ usuario_id: ctx.usuario.id, dia_id: dia.id, texto, orden }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_NOTA_CREADA', 'agenda_notas', row.id, { dia_id: String(dia.id) });
  return devolverRegistro(row, ctx);
}
export async function guardarNotaAgenda(req, ctx) {
  const body = entradaAgenda(req, ['texto', 'cumplida'], { version: true });
  exigir(body.texto !== undefined || body.cumplida !== undefined, 422, 'DATOS_INVALIDOS', 'No hay campos de nota para guardar.');
  const row = await registroPropio(m.agenda_notas, req, ctx);
  comprobarVersion(row, body.version);
  const data = { version: siguienteVersion(row) };
  if (body.texto !== undefined) data.texto = textoAgenda(body.texto, 'texto', 4000);
  if (body.cumplida !== undefined) data.cumplida = bandera(body.cumplida, 'cumplida');
  await row.update(data, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_NOTA_ACTUALIZADA', 'agenda_notas', row.id,
    { campos: Object.keys(body).filter(key => key !== 'version'), version: data.version });
  return devolverRegistro(row, ctx);
}
export async function eliminarNotaAgenda(req, ctx) {
  const body = entradaAgenda(req, [], { version: true });
  const row = await registroPropio(m.agenda_notas, req, ctx);
  comprobarVersion(row, body.version);
  await row.destroy({ transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_NOTA_ELIMINADA', 'agenda_notas', row.id);
  return { id: String(row.id), eliminada: true };
}
export async function ordenarNotasAgenda(req, ctx) {
  const body = entradaAgenda(req, ['notas']);
  exigir(Array.isArray(body.notas), 422, 'DATOS_INVALIDOS', 'Indicar la lista completa de notas con su versión.');
  const esperadas = body.notas.map(value => {
    const nota = camposPermitidos(value, ['id', 'version']);
    return { id: id(nota.id), version: versionAgenda(nota.version) };
  });
  exigir(new Set(esperadas.map(n => n.id)).size === esperadas.length, 422, 'DATOS_INVALIDOS', 'Una nota está repetida.');
  const dia = await diaPropio(ctx, fechaAgenda(req.params?.fecha));
  const notas = dia ? await m.agenda_notas.findAll({ where: { usuario_id: ctx.usuario.id, dia_id: dia.id }, transaction: ctx.transaction }) : [];
  const porId = new Map(notas.map(nota => [String(nota.id), nota]));
  exigir(notas.length === esperadas.length && esperadas.every(n => porId.has(n.id)), 409, 'AGENDA_LISTA_CAMBIADA',
    'Las notas cambiaron. Actualizá el día antes de reordenarlas.');
  for (const nota of esperadas) comprobarVersion(porId.get(nota.id), nota.version);
  for (const [orden, nota] of esperadas.entries()) {
    const row = porId.get(nota.id);
    if (Number(row.orden) !== orden) await row.update({ orden, version: siguienteVersion(row) }, { transaction: ctx.transaction });
  }
  if (dia) await auditarAgenda(ctx, 'AGENDA_NOTAS_ORDENADAS', 'agenda_dias', dia.id, { cantidad: notas.length });
  return dia ? m.agenda_notas.findAll({ where: { usuario_id: ctx.usuario.id, dia_id: dia.id }, transaction: ctx.transaction,
    order: [['orden', 'ASC'], ['id', 'ASC']] }) : [];
}
