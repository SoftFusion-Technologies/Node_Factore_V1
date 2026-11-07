/* Benjamin Orellana - 07/11/2026 - Entrada estricta e identidad estable de cada creación en Google. */
import { createHmac } from 'node:crypto';
import { camposPermitidos, exigir, texto } from '../../utils/validacion.utils.js';
import { fechaAgenda } from './agendaDatos.service.js';
import { fechaUTC } from '../Acceso/permisoAcceso.service.js';

export function referenciaEventoGoogle(value) {
  exigir(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
    422, 'DATOS_INVALIDOS', 'La referencia del evento no es válida.');
  return value;
}
export function entradaEventoGoogle(body) {
  camposPermitidos(body, ['referencia', 'conexion_revision', 'titulo', 'todo_el_dia', 'inicio', 'fin']);
  const referencia = referenciaEventoGoogle(body.referencia);
  const conexion_revision = referenciaEventoGoogle(body.conexion_revision);
  const titulo = texto(body.titulo, 'Título', 200);
  exigir(typeof body.todo_el_dia === 'boolean', 422, 'DATOS_INVALIDOS', 'Revisá el tipo de evento.');
  const todo_el_dia = body.todo_el_dia;
  const inicio = todo_el_dia ? fechaAgenda(body.inicio) : fechaUTC(body.inicio, 'inicio').toISOString();
  const fin = todo_el_dia ? fechaAgenda(body.fin) : fechaUTC(body.fin, 'fin').toISOString();
  const min = Date.parse(inicio + (todo_el_dia ? 'T00:00:00-03:00' : ''));
  const max = Date.parse(fin + (todo_el_dia ? 'T00:00:00-03:00' : ''));
  exigir(max > min && max - min <= 366 * 86400000, 422, 'DATOS_INVALIDOS',
    'El fin debe ser posterior al inicio y la duración no puede superar un año.');
  return { referencia, conexion_revision, titulo, todo_el_dia, inicio, fin };
}
export function identidadEventoGoogle(config, usuario, revision, referencia, entrada) {
  const digest = value => createHmac('sha256', config.key).update(value).digest('hex');
  const id = digest('factor-e:evento:v1:' + usuario + ':' + revision + ':' + referencia);
  return { id, ...(entrada ? { huella: digest(JSON.stringify(entrada)) } : {}) };
}
