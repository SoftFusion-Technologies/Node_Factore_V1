/* Benjamin Orellana - 05/10/2026 - Presentación de comercios amigos visible al alumno. */
import { controladorAlumno, listadoSQL } from '../../Services/Campus/campusAcceso.service.js';
import { columnasComercio, origenComercio, comercioVisible } from '../../Services/Campus/campusContenido.service.js';
import { consulta, busqueda } from '../../utils/listados.utils.js';
import { texto, camposPermitidos } from '../../utils/validacion.utils.js';
export const OBRS_ComerciosCampus_CTS = controladorAlumno(async req => {
  const query = consulta(req.query, ['rubro', 'ciudad']), where = [], values = [];
  for (const key of ['rubro', 'ciudad']) if (query[key] !== undefined) { where.push(`co.${key} = ?`); values.push(texto(query[key], key, 120)); }
  const q = busqueda(query.q); if (q) { where.push('(co.nombre LIKE ? OR co.descripcion LIKE ?)'); values.push(`%${q}%`, `%${q}%`); }
  return listadoSQL(`SELECT ${columnasComercio} ${origenComercio}${where.length ? ' AND ' + where.join(' AND ') : ''}`,
    values, query, { id: 'co.id', nombre: 'co.nombre', orden: 'co.orden' }, 'orden');
});
export const OBRS_DetComercioCampus_CTS = controladorAlumno(async req => {
  camposPermitidos(req.query, [], { vacio: true }); return { data: await comercioVisible(req.params?.comercio_id) };
});
