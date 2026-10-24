/* Benjamin Orellana - 20/10/2026 - Fechas locales, versiones y progreso de Mi agenda. */
import { camposPermitidos, entero, exigir, opcion, texto } from '../../utils/validacion.utils.js';
import { fechaGuardada } from '../Acceso/permisoAcceso.service.js';

export const categoriasAgenda = ['OPERATIVO', 'COMERCIAL', 'ESTRATEGICO', 'PERSONAL'];
export const camposDia = ['frase', ...[1, 2, 3].flatMap(n => [`prioridad_${n}_texto`, `prioridad_${n}_cumplida`])];
export const categoriaAgenda = value => opcion(value, 'categoria', categoriasAgenda);
export const versionAgenda = (value, inicial = false) => entero(value, 'version', inicial ? 0 : 1, 4294967294);

export function comprobarVersion(row, value) {
  exigir(Number(row?.version ?? 0) === versionAgenda(value, true), 409, 'AGENDA_VERSION_CAMBIADA',
    'Este registro cambió. Actualizá la agenda antes de guardar nuevamente.');
}
export function siguienteVersion(row) {
  exigir(Number(row.version) < 4294967295, 409, 'AGENDA_VERSION_AGOTADA', 'El registro requiere revisión de Factor E.');
  return Number(row.version) + 1;
}
export function fechaAgenda(value) {
  exigir(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 422, 'FECHA_INVALIDA', 'Usar fecha AAAA-MM-DD.');
  const fecha = new Date(value + 'T00:00:00.000Z');
  exigir(Number.isFinite(fecha.getTime()) && fecha.getUTCFullYear() >= 1000
    && fecha.toISOString().slice(0, 10) === value, 422, 'FECHA_INVALIDA', 'La fecha no es válida.');
  return value;
}
export function rangoMes(value) {
  exigir(typeof value === 'string' && /^\d{4}-\d{2}$/.test(value), 422, 'FECHA_INVALIDA', 'Usar mes AAAA-MM.');
  const desde = fechaAgenda(value + '-01');
  const [year, month] = value.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { desde, hasta: value + '-' + String(last).padStart(2, '0') };
}
export function fechaArgentina(ahora) {
  return new Date(fechaGuardada(ahora).getTime() - 3 * 3600000).toISOString().slice(0, 10);
}
export function horaAgenda(value) {
  if (value === null || value === '') return null;
  exigir(typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value),
    422, 'HORA_INVALIDA', 'La hora debe indicar HH:MM.');
  return value.length === 5 ? value + ':00' : value;
}
export function textoAgenda(value, name, max, vacio = false) {
  if (!vacio) return texto(value, name, max);
  exigir(typeof value === 'string' && !value.includes('\0') && [...value.trim()].length <= max,
    422, 'DATOS_INVALIDOS', `${name} no es válido o supera el tamaño permitido.`);
  return value.trim();
}
export function entradaAgenda(req, permitidos, { version = false, inicial = false } = {}) {
  camposPermitidos(req.query, [], { vacio: true });
  const body = camposPermitidos(req.body, [...permitidos, ...(version ? ['version'] : [])]);
  if (version) versionAgenda(body.version, inicial);
  return body;
}
export function progresoAgenda(dia, tareas = []) {
  let total = 0, completados = 0, pilares = 0, pilaresCumplidos = 0;
  for (const n of [1, 2, 3]) {
    if (!String(dia?.[`prioridad_${n}_texto`] ?? '').trim()) continue;
    pilares++; total += 4;
    if (dia[`prioridad_${n}_cumplida`]) { pilaresCumplidos++; completados += 4; }
  }
  for (const tarea of tareas) {
    const puntos = { 1: 5, 2: 3, 3: 1 }[tarea.prioridad];
    total += puntos;
    if (tarea.completada) completados += puntos;
  }
  const porcentaje = total ? Math.round(100 * completados / total) : 0;
  // El estado se decide por elementos completados, no por un porcentaje redondeado.
  const todas = tareas.every(tarea => Boolean(tarea.completada)) && pilares === pilaresCumplidos;
  return { porcentaje, puntos_totales: total, puntos_completados: completados,
    tareas_totales: tareas.length, tareas_completadas: tareas.filter(tarea => tarea.completada).length,
    pilares_totales: pilares, pilares_completados: pilaresCumplidos,
    estado: total === 0 ? 'VACIO' : todas ? 'COMPLETADO' : 'PENDIENTE' };
}
export function segundosRegistro(registro, ahora, venceEn = null) {
  if (registro.fin_en !== null) return Number(registro.duracion_segundos);
  const inicio = fechaGuardada(registro.inicio_en).getTime();
  const fin = Math.min(fechaGuardada(ahora).getTime(), fechaGuardada(venceEn)?.getTime() ?? Infinity);
  return Math.max(0, Math.floor((fin - inicio) / 1000));
}
export function vistaRegistro(registro, ahora, venceEn) {
  const row = typeof registro.toJSON === 'function' ? registro.toJSON() : registro;
  return { ...row, segundos_acumulados: segundosRegistro(row, ahora, venceEn) };
}
