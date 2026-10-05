/* Benjamin Orellana - 05/10/2026 - Ventanas UTC y permisos por curso/lección. */
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import { exigir } from '../../utils/validacion.utils.js';

// Contrato uniforme con las etapas anteriores: ISO UTC explícito, precisión de ms.
export function fechaUTC(value, name, nullable = false) {
  if (nullable && value === null) return null;
  exigir(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),
    422, 'FECHA_INVALIDA', `${name} requiere una fecha ISO UTC terminada en Z.`);
  const normal = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, ms) => '.' + (ms ?? '').padEnd(3, '0') + 'Z');
  const date = new Date(normal);
  exigir(Number.isFinite(date.getTime()) && date.toISOString() === normal && date.getUTCFullYear() >= 1000,
    422, 'FECHA_INVALIDA', `${name} no es una fecha válida.`);
  return date;
}
export function fechaGuardada(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(String(value).replace(' ', 'T').replace(/Z$/, '') + 'Z');
}
export async function ahoraDB(transaction) {
  const [row] = await db.query('SELECT UTC_TIMESTAMP(3) AS ahora_en', { type: QueryTypes.SELECT, transaction });
  const now = fechaGuardada(row.ahora_en);
  exigir(Number.isFinite(now?.getTime()), 500, 'RELOJ_INVALIDO', 'No se pudo obtener la hora de la base.');
  return now;
}
export function validarVentana(acceso) {
  const start = fechaGuardada(acceso.inicio_en), end = fechaGuardada(acceso.vence_en);
  exigir(start && Number.isFinite(start.getTime()) && (!end || end > start),
    422, 'VENTANA_INVALIDA', 'El vencimiento debe ser posterior al inicio.');
}
export function ventanaEfectiva(acceso, excepcion) {
  const start = fechaGuardada(acceso.inicio_en), end = fechaGuardada(acceso.vence_en);
  const localStart = fechaGuardada(excepcion?.inicio_en), localEnd = fechaGuardada(excepcion?.vence_en);
  return { inicio_en: localStart && localStart > start ? localStart : start,
    vence_en: !end ? localEnd : !localEnd || end < localEnd ? end : localEnd };
}
export function validarVentanaLeccion(excepcion, acceso) {
  const start = fechaGuardada(excepcion.inicio_en), end = fechaGuardada(excepcion.vence_en);
  exigir(!start || !end || end > start, 422, 'VENTANA_INVALIDA', 'El vencimiento del video debe ser posterior a su inicio.');
  if (excepcion.estado !== 'HABILITADA') return;
  const effective = ventanaEfectiva(acceso, excepcion);
  exigir(!effective.vence_en || effective.vence_en > effective.inicio_en, 422, 'LECCION_FUERA_VENTANA',
    'La ventana del video no se cruza con la del curso.');
}
export function estadoTemporal(acceso, now) {
  if (acceso.estado !== 'ACTIVO') return acceso.estado;
  const end = fechaGuardada(acceso.vence_en);
  if (end && end <= now) return 'VENCIDO';
  return fechaGuardada(acceso.inicio_en) > now ? 'PROGRAMADO' : 'ACTIVO';
}
export const estadosTemporales = ['ACTIVO', 'PROGRAMADO', 'VENCIDO', 'SUSPENDIDO', 'REVOCADO'];
// Alias interno constante; nunca interpolar nombres recibidos por HTTP.
export const sqlEstadoTemporal = "CASE WHEN `curso_accesos`.`estado` = 'REVOCADO' THEN 'REVOCADO' WHEN `curso_accesos`.`estado` = 'SUSPENDIDO' THEN 'SUSPENDIDO' WHEN `curso_accesos`.`vence_en` IS NOT NULL AND `curso_accesos`.`vence_en` <= UTC_TIMESTAMP(3) THEN 'VENCIDO' WHEN `curso_accesos`.`inicio_en` > UTC_TIMESTAMP(3) THEN 'PROGRAMADO' ELSE 'ACTIVO' END";

// Mismo criterio de la vista MySQL; el campus verificará además sesión y disco.
export function permisoLeccion(acceso, excepcion, contenido, now) {
  const window = ventanaEfectiva(acceso, excepcion);
  const result = motivo => ({ habilitada: motivo === null, motivo,
    inicio_efectivo_en: window.inicio_en, vence_efectivo_en: window.vence_en });
  const { usuario, cliente, curso, modulo, leccion, video } = contenido;
  if (String(usuario?.id) !== String(acceso.usuario_id) || String(cliente?.id) !== String(usuario?.cliente_id)
    || String(curso?.id) !== String(acceso.curso_id)
    || String(leccion?.curso_id) !== String(acceso.curso_id) || String(leccion?.modulo_id) !== String(modulo?.id)
    || String(modulo?.curso_id) !== String(acceso.curso_id) || String(leccion?.video_archivo_id) !== String(video?.id)
    || (excepcion && (String(excepcion.acceso_id) !== String(acceso.id) || String(excepcion.curso_id) !== String(acceso.curso_id)
      || String(excepcion.leccion_id) !== String(leccion?.id)))) return result('RELACION_INVALIDA');
  if (usuario?.rol !== 'ALUMNO' || usuario.estado !== 'ACTIVO') return result('CUENTA_NO_ACTIVA');
  if (cliente?.activo !== 1) return result('CLIENTE_INACTIVO');
  if (curso?.estado !== 'PUBLICADO') return result('CURSO_NO_PUBLICADO');
  const state = estadoTemporal(acceso, now);
  if (state !== 'ACTIVO') return result('ACCESO_' + state);
  if (modulo?.estado !== 'ACTIVO' || leccion?.estado !== 'PUBLICADA') return result('CONTENIDO_NO_PUBLICADO');
  if (video?.tipo !== 'VIDEO' || video.estado !== 'DISPONIBLE') return result('VIDEO_NO_DISPONIBLE');
  if (!excepcion && acceso.alcance === 'SELECCION') return result('LECCION_NO_SELECCIONADA');
  if (excepcion?.estado === 'BLOQUEADA') return result('LECCION_BLOQUEADA');
  if (window.vence_en && window.vence_en <= now) return result('LECCION_VENCIDA');
  if (window.inicio_en > now) return result('LECCION_PROGRAMADA');
  return result(null);
}
