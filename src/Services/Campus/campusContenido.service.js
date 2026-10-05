/* Benjamin Orellana - 05/10/2026 - Contenido habilitado por las vistas de Factor E. */
import { seleccionar } from './campusAcceso.service.js';
import { id, exigir } from '../../utils/validacion.utils.js';

export const columnasCurso = `c.id, c.titulo, c.slug, c.descripcion_corta, c.descripcion, c.modalidad, c.orden,
  c.portada_archivo_id, a.id AS acceso_id, a.alcance, a.inicio_en, a.vence_en,
  (SELECT COUNT(*) FROM vw_campus_lecciones_habilitadas hp WHERE hp.usuario_id = a.usuario_id AND hp.curso_id = c.id) AS lecciones_habilitadas,
  (SELECT COUNT(*) FROM vw_campus_lecciones_habilitadas hp JOIN leccion_progreso p ON p.usuario_id = hp.usuario_id
    AND p.curso_id = hp.curso_id AND p.leccion_id = hp.leccion_id AND p.estado = 'COMPLETADA'
    WHERE hp.usuario_id = a.usuario_id AND hp.curso_id = c.id) AS lecciones_completadas`;
export const origenCurso = `FROM cursos c JOIN curso_accesos a ON a.curso_id = c.id AND a.usuario_id = ?
  WHERE EXISTS (SELECT 1 FROM vw_campus_lecciones_habilitadas h WHERE h.usuario_id = a.usuario_id AND h.curso_id = c.id)`;
export function presentarCurso(row) {
  const { lecciones_habilitadas, lecciones_completadas, acceso_id, alcance, inicio_en, vence_en, ...curso } = row;
  const total = Number(lecciones_habilitadas), completadas = Number(lecciones_completadas);
  return { ...curso, acceso: { id: acceso_id, alcance, inicio_en, vence_en },
    progreso: { lecciones_habilitadas: total, lecciones_completadas: completadas,
      porcentaje: total ? Math.round(10000 * completadas / total) / 100 : 0 } };
}
export async function obtenerCurso(usuarioId, cursoId, transaction) {
  const [row] = await seleccionar(`SELECT ${columnasCurso} ${origenCurso} AND c.id = ?`, [usuarioId, id(cursoId, 'curso_id')], transaction);
  exigir(row, 404, 'NO_ENCONTRADO', 'Curso no disponible.');
  return presentarCurso(row);
}
export const columnasLeccion = `l.id, l.curso_id, l.modulo_id, l.titulo, l.descripcion, l.orden, l.video_archivo_id, l.portada_archivo_id,
  m.titulo AS modulo_titulo, m.descripcion AS modulo_descripcion, m.orden AS modulo_orden,
  h.curso_inicio_en, h.curso_vence_en, h.leccion_inicio_en, h.leccion_vence_en,
  av.duracion_segundos, p.estado AS progreso_estado, p.posicion_segundos, p.completada_en, p.ultimo_acceso_en`;
export const origenLeccion = `FROM vw_campus_lecciones_habilitadas h
  JOIN curso_lecciones l ON l.id = h.leccion_id AND l.curso_id = h.curso_id
  JOIN curso_modulos m ON m.id = l.modulo_id AND m.curso_id = l.curso_id
  JOIN archivos av ON av.id = h.video_archivo_id
  LEFT JOIN leccion_progreso p ON p.usuario_id = h.usuario_id AND p.curso_id = h.curso_id AND p.leccion_id = h.leccion_id
  WHERE h.usuario_id = ? AND h.curso_id = ?`;
export function presentarLeccion(row) {
  const { progreso_estado, posicion_segundos, completada_en, ultimo_acceso_en, modulo_titulo, modulo_descripcion, modulo_orden, ...leccion } = row;
  return { ...leccion, modulo: { id: row.modulo_id, titulo: modulo_titulo, descripcion: modulo_descripcion, orden: modulo_orden },
    progreso: { estado: progreso_estado ?? 'SIN_INICIAR', posicion_segundos: Number(posicion_segundos ?? 0), completada_en, ultimo_acceso_en } };
}
export async function leccionesCurso(usuarioId, cursoId, transaction) {
  const rows = await seleccionar(`SELECT ${columnasLeccion} ${origenLeccion} ORDER BY m.orden, m.id, l.orden, l.id`,
    [usuarioId, id(cursoId, 'curso_id')], transaction);
  return rows.map(presentarLeccion);
}
export async function obtenerLeccion(usuarioId, cursoId, leccionId, transaction) {
  const [row] = await seleccionar(`SELECT ${columnasLeccion} ${origenLeccion} AND l.id = ?`,
    [usuarioId, id(cursoId, 'curso_id'), id(leccionId, 'leccion_id')], transaction);
  exigir(row, 404, 'NO_ENCONTRADO', 'Lección no disponible.');
  return presentarLeccion(row);
}
export const columnasMaterial = `cm.id, cm.curso_id, cm.leccion_id, cm.titulo, cm.orden,
  ar.nombre_original, ar.mime_type, ar.tamanio_bytes`;
export const origenMaterial = `FROM curso_materiales cm JOIN archivos ar ON ar.id = cm.archivo_id
  WHERE cm.curso_id = ? AND cm.activo = 1 AND ar.tipo = 'DOCUMENTO' AND ar.estado = 'DISPONIBLE'
  AND EXISTS (SELECT 1 FROM vw_campus_lecciones_habilitadas h WHERE h.usuario_id = ? AND h.curso_id = cm.curso_id
    AND (cm.leccion_id IS NULL OR cm.leccion_id = h.leccion_id))`;
export async function materialDisponible(usuarioId, cursoId, materialId, transaction) {
  const [row] = await seleccionar(`SELECT ${columnasMaterial}, cm.archivo_id ${origenMaterial} AND cm.id = ?`,
    [id(cursoId, 'curso_id'), usuarioId, id(materialId, 'material_id')], transaction);
  exigir(row, 404, 'NO_ENCONTRADO', 'Material no disponible.'); return row;
}
export const columnasComercio = `co.id, co.nombre, co.slug, co.rubro, co.descripcion, co.logo_archivo_id,
  co.ciudad, co.direccion_publica, co.telefono_publico, co.email_publico, co.web_url, co.instagram_url, co.orden`;
export const origenComercio = 'FROM vw_campus_comercios_visibles co WHERE 1 = 1';
export async function comercioVisible(comercioId, transaction) {
  const [row] = await seleccionar(`SELECT ${columnasComercio} ${origenComercio} AND co.id = ?`, [id(comercioId, 'comercio_id')], transaction);
  exigir(row, 404, 'NO_ENCONTRADO', 'Comercio no disponible.'); return row;
}
