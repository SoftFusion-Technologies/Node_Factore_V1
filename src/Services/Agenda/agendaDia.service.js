/* Benjamin Orellana - 20/10/2026 - Calendario, tres pilares y preferencias personales. */
import { Op } from 'sequelize';
import { modelos as m } from '../../Models/index.js';
import { bandera, camposPermitidos, exigir, opcion } from '../../utils/validacion.utils.js';
import { auditarAgenda } from './agendaAcceso.service.js';
import { camposDia, comprobarVersion, entradaAgenda, fechaAgenda, fechaArgentina,
  progresoAgenda, rangoMes, siguienteVersion, textoAgenda, vistaRegistro, segundosRegistro } from './agendaDatos.service.js';

function diaVacio(fecha) {
  return { id: null, fecha, frase: '', version: 0, ...Object.fromEntries([1, 2, 3].flatMap(n => [
    [`prioridad_${n}_texto`, ''], [`prioridad_${n}_cumplida`, 0]
  ])) };
}
export async function diaPropio(ctx, fecha, crear = false) {
  const validada = fechaAgenda(fecha);
  const where = { usuario_id: ctx.usuario.id, fecha: validada };
  let row = await m.agenda_dias.findOne({ where, transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE });
  if (!row && crear) row = await m.agenda_dias.create(where, { transaction: ctx.transaction });
  return row;
}
export async function obtenerDiaAgenda(req, ctx) {
  camposPermitidos(req.query, [], { vacio: true });
  const fecha = fechaAgenda(req.params?.fecha);
  const dia = await diaPropio(ctx, fecha);
  const where = { usuario_id: ctx.usuario.id, dia_id: dia?.id ?? '0' };
  const options = { where, transaction: ctx.transaction };
  const tareas = dia ? await m.agenda_tareas.findAll({ ...options, order: [['hora', 'ASC'], ['prioridad', 'ASC'], ['id', 'ASC']] }) : [];
  const notas = dia ? await m.agenda_notas.findAll({ ...options, order: [['orden', 'ASC'], ['id', 'ASC']] }) : [];
  const tiempos = dia ? await m.agenda_tiempo_registros.findAll({ ...options, order: [['inicio_en', 'ASC'], ['id', 'ASC']] }) : [];
  const abiertos = await m.agenda_tiempo_registros.findAll({ where: { usuario_id: ctx.usuario.id, en_curso: 1 },
    transaction: ctx.transaction, order: [['categoria', 'ASC']] });
  const preferencias = await m.agenda_preferencias.findOne({ where: { usuario_id: ctx.usuario.id }, transaction: ctx.transaction });
  return { dia: dia ?? diaVacio(fecha), tareas, notas,
    progreso: progresoAgenda(dia, tareas),
    tiempos: tiempos.map(row => vistaRegistro(row, ctx.ahora, ctx.acceso.vence_en)),
    cronometros_abiertos: abiertos.map(row => vistaRegistro(row, ctx.ahora, ctx.acceso.vence_en)),
    tiempo_por_categoria: Object.fromEntries(['OPERATIVO', 'COMERCIAL', 'ESTRATEGICO', 'PERSONAL'].map(categoria => [categoria,
      tiempos.filter(row => row.categoria === categoria).reduce((total, row) => total + segundosRegistro(row, ctx.ahora, ctx.acceso.vence_en), 0)])),
    preferencias: preferencias ?? { tema: 'CLARO', version: 0 },
    ahora_en: ctx.ahora, hoy: fechaArgentina(ctx.ahora), zona_horaria: 'America/Argentina/Buenos_Aires' };
}
export async function obtenerMesAgenda(req, ctx) {
  const query = camposPermitidos(req.query, ['mes']);
  const { desde, hasta } = rangoMes(query.mes);
  const dias = await m.agenda_dias.findAll({ where: { usuario_id: ctx.usuario.id, fecha: { [Op.between]: [desde, hasta] } },
    transaction: ctx.transaction, order: [['fecha', 'ASC']] });
  const tareas = dias.length ? await m.agenda_tareas.findAll({ where: { usuario_id: ctx.usuario.id, dia_id: { [Op.in]: dias.map(row => row.id) } },
    transaction: ctx.transaction, order: [['hora', 'ASC'], ['id', 'ASC']] }) : [];
  const hoy = fechaArgentina(ctx.ahora), resultados = [];
  const porFecha = new Map(dias.map(dia => [dia.fecha, dia]));
  for (let numero = 1; numero <= Number(hasta.slice(-2)); numero++) {
    const fecha = desde.slice(0, 8) + String(numero).padStart(2, '0');
    const dia = porFecha.get(fecha);
    const delDia = dia ? tareas.filter(tarea => String(tarea.dia_id) === String(dia.id)) : [];
    resultados.push({ fecha, es_hoy: fecha === hoy, ...progresoAgenda(dia, delDia),
      vistas_previas: delDia.slice(0, 2).map(({ id, texto, categoria, completada }) => ({ id, texto, categoria, completada })),
      tareas_adicionales: Math.max(0, delDia.length - 2) });
  }
  return { mes: query.mes, hoy, ahora_en: ctx.ahora, dias: resultados };
}
export async function guardarDiaAgenda(req, ctx) {
  const body = entradaAgenda(req, camposDia, { version: true, inicial: true });
  const cambios = Object.keys(body).filter(key => key !== 'version');
  exigir(cambios.length, 422, 'DATOS_INVALIDOS', 'No hay campos del día para guardar.');
  const fecha = fechaAgenda(req.params?.fecha), row = await diaPropio(ctx, fecha);
  comprobarVersion(row, body.version);
  const data = {};
  for (const key of cambios) data[key] = key.endsWith('_cumplida') ? bandera(body[key], key) : textoAgenda(body[key], key, 500, true);
  for (const n of [1, 2, 3]) {
    const texto = data[`prioridad_${n}_texto`] ?? row?.[`prioridad_${n}_texto`] ?? '';
    const cumplida = data[`prioridad_${n}_cumplida`] ?? row?.[`prioridad_${n}_cumplida`] ?? 0;
    exigir(!cumplida || texto.trim(), 422, 'PILAR_VACIO', 'Un pilar vacío no puede marcarse como cumplido.');
  }
  data.version = row ? siguienteVersion(row) : 1;
  const result = row ? await row.update(data, { transaction: ctx.transaction })
    : await m.agenda_dias.create({ usuario_id: ctx.usuario.id, fecha, ...data }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_DIA_GUARDADO', 'agenda_dias', result.id, { campos: cambios, version: data.version });
  return result.reload({ transaction: ctx.transaction });
}
export async function guardarPreferenciasAgenda(req, ctx) {
  const body = entradaAgenda(req, ['tema'], { version: true, inicial: true });
  const tema = opcion(body.tema, 'tema', ['CLARO', 'OSCURO']);
  const row = await m.agenda_preferencias.findOne({ where: { usuario_id: ctx.usuario.id }, transaction: ctx.transaction });
  comprobarVersion(row, body.version);
  const data = { tema, version: row ? siguienteVersion(row) : 1 };
  const result = row ? await row.update(data, { transaction: ctx.transaction })
    : await m.agenda_preferencias.create({ usuario_id: ctx.usuario.id, ...data }, { transaction: ctx.transaction });
  return result.reload({ transaction: ctx.transaction });
}
