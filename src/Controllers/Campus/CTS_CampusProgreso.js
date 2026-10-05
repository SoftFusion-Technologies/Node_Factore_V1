/* Benjamin Orellana - 05/10/2026 - Progreso y posición de reproducción del alumno. */
import { controladorAlumno } from '../../Services/Campus/campusAcceso.service.js';
import { obtenerCurso, leccionesCurso } from '../../Services/Campus/campusContenido.service.js';
import { guardarProgreso } from '../../Services/Campus/campusProgreso.service.js';
import { camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { exigirJson } from '../../Services/Usuario/configAuth.service.js';
export const OBRS_MiProgresoCurso_CTS = controladorAlumno(async (req, session) => {
  camposPermitidos(req.query, [], { vacio: true });
  const curso = await obtenerCurso(session.usuario.id, req.params?.curso_id);
  const rows = await leccionesCurso(session.usuario.id, req.params?.curso_id);
  const resumibles = rows.filter(row => row.progreso.ultimo_acceso_en).sort((a, b) =>
    String(b.progreso.ultimo_acceso_en).localeCompare(String(a.progreso.ultimo_acceso_en)) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  return { data: { curso_id: curso.id, ...curso.progreso, retomar: resumibles.length ?
    { leccion_id: resumibles[0].id, posicion_segundos: resumibles[0].progreso.posicion_segundos } : null,
    lecciones: rows.map(row => ({ leccion_id: row.id, ...row.progreso })) } };
});
export const UR_MiProgresoLeccion_CTS = controladorAlumno(async (req, session) => {
  exigir(req.method === 'PATCH', 405, 'METODO_INVALIDO', 'Usar PATCH para guardar progreso.');
  exigirJson(req);
  camposPermitidos(req.query, [], { vacio: true });
  return { message: 'Progreso guardado.', data: await guardarProgreso(req, session) };
});
