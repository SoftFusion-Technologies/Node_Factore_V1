/* Benjamin Orellana - 05/10/2026 - Materiales generales y por lección autorizada. */
import { controladorAlumno, listadoSQL } from '../../Services/Campus/campusAcceso.service.js';
import { obtenerCurso, obtenerLeccion, columnasMaterial, origenMaterial } from '../../Services/Campus/campusContenido.service.js';
import { consulta, busqueda } from '../../utils/listados.utils.js';
import { id, bandera, exigir } from '../../utils/validacion.utils.js';
export const OBRS_MisMateriales_CTS = controladorAlumno(async (req, session) => {
  const cursoId = id(req.params?.curso_id, 'curso_id'), query = consulta(req.query, ['leccion_id', 'generales']);
  await obtenerCurso(session.usuario.id, cursoId);
  const general = query.generales === undefined ? false : Boolean(bandera(query.generales, 'generales', true));
  exigir(!(general && query.leccion_id !== undefined), 422, 'FILTRO_INVALIDO', 'Usar generales o leccion_id.');
  const leccionId = query.leccion_id === undefined ? null : id(query.leccion_id, 'leccion_id');
  if (leccionId) await obtenerLeccion(session.usuario.id, cursoId, leccionId);
  const q = busqueda(query.q);
  return listadoSQL(`SELECT ${columnasMaterial} ${origenMaterial}${general ? ' AND cm.leccion_id IS NULL' : leccionId ? ' AND cm.leccion_id = ?' : ''}${q ? ' AND cm.titulo LIKE ?' : ''}`,
    [cursoId, session.usuario.id, ...(leccionId ? [leccionId] : []), ...(q ? [`%${q}%`] : [])], query,
    { id: 'cm.id', titulo: 'cm.titulo', orden: 'cm.orden' }, 'orden');
});
