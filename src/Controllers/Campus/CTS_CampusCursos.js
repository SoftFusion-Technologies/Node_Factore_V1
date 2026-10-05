/* Benjamin Orellana - 05/10/2026 - Cursos y lecciones del alumno autenticado. */
import { controladorAlumno, listadoSQL } from '../../Services/Campus/campusAcceso.service.js';
import { columnasCurso, origenCurso, presentarCurso, obtenerCurso, leccionesCurso, obtenerLeccion } from '../../Services/Campus/campusContenido.service.js';
import { consulta, busqueda } from '../../utils/listados.utils.js';
import { id } from '../../utils/validacion.utils.js';

export const OBRS_MisCursos_CTS = controladorAlumno(async (req, session) => {
  const query = consulta(req.query), q = busqueda(query.q);
  const result = await listadoSQL(`SELECT ${columnasCurso} ${origenCurso}${q ? ' AND (c.titulo LIKE ? OR c.descripcion_corta LIKE ?)' : ''}`,
    [session.usuario.id, ...(q ? [`%${q}%`, `%${q}%`] : [])], query, { id: 'c.id', titulo: 'c.titulo', orden: 'c.orden' }, 'orden');
  return { ...result, data: result.data.map(presentarCurso) };
});
export const OBRS_DetMiCurso_CTS = controladorAlumno(async (req, session) => {
  consulta(req.query);
  const cursoId = id(req.params?.curso_id, 'curso_id'), curso = await obtenerCurso(session.usuario.id, cursoId);
  const lecciones = await leccionesCurso(session.usuario.id, cursoId), map = new Map();
  for (const row of lecciones) {
    const { modulo, ...leccion } = row;
    if (!map.has(String(modulo.id))) map.set(String(modulo.id), { ...modulo, lecciones: [] });
    map.get(String(modulo.id)).lecciones.push(leccion);
  }
  return { data: { ...curso, modulos: [...map.values()] } };
});
export const OBRS_MiLeccion_CTS = controladorAlumno(async (req, session) => {
  consulta(req.query);
  return { data: await obtenerLeccion(session.usuario.id, req.params?.curso_id, req.params?.leccion_id) };
});
