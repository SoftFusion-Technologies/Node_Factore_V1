/* Benjamin Orellana - 05/10/2026 - Archivos por asociación autorizada; ningún ID libre de archivo. */
import Archivos from '../../Models/Archivo/MD_TB_Archivos.js';
import { alumno, seleccionar } from './campusAcceso.service.js';
import { obtenerCurso, obtenerLeccion, materialDisponible, comercioVisible } from './campusContenido.service.js';
import { ahoraDB, fechaGuardada } from '../Acceso/permisoAcceso.service.js';
import { servirArchivo } from '../Archivo/contenidoArchivo.service.js';
import { camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { responderError } from '../../utils/http.utils.js';
import { cookieSesion } from '../Usuario/configAuth.service.js';

async function referencia(req, session, tipo) {
  const usuarioId = session.usuario.id, p = req.params ?? {};
  let archivoId, esperado, limites = [fechaGuardada(session.vence_en)];
  if (tipo === 'video' || tipo === 'portada_leccion') {
    const row = await obtenerLeccion(usuarioId, p.curso_id, p.leccion_id);
    archivoId = row[tipo === 'video' ? 'video_archivo_id' : 'portada_archivo_id']; esperado = tipo === 'video' ? 'VIDEO' : 'IMAGEN';
    limites.push(fechaGuardada(row.curso_vence_en), fechaGuardada(row.leccion_vence_en));
  } else if (tipo === 'portada_curso') {
    const row = await obtenerCurso(usuarioId, p.curso_id); archivoId = row.portada_archivo_id; esperado = 'IMAGEN';
    limites.push(fechaGuardada(row.acceso.vence_en));
  } else if (tipo === 'material') {
    const row = await materialDisponible(usuarioId, p.curso_id, p.material_id); archivoId = row.archivo_id; esperado = 'DOCUMENTO';
    // Los materiales generales requieren al menos una lección habilitada; puede ser una selección con fecha propia.
    const ventanas = await seleccionar(`SELECT curso_vence_en, leccion_vence_en FROM vw_campus_lecciones_habilitadas
      WHERE usuario_id = ? AND curso_id = ? AND (? IS NULL OR leccion_id = ?)`, [usuarioId, row.curso_id, row.leccion_id, row.leccion_id]);
    exigir(ventanas.length, 404, 'NO_ENCONTRADO', 'Material no disponible.');
    const fines = ventanas.map(item => {
      const ends = [item.curso_vence_en, item.leccion_vence_en].filter(value => value !== null).map(fechaGuardada);
      return ends.length ? Math.min(...ends.map(date => date.getTime())) : null;
    });
    // Para material general basta cualquiera vigente: la última ventana determina el próximo corte por fecha.
    if (fines.every(value => value !== null)) limites.push(new Date(fines.reduce((latest, value) => Math.max(latest, value), -Infinity)));
  } else {
    const row = await comercioVisible(p.comercio_id); archivoId = row.logo_archivo_id; esperado = 'IMAGEN';
  }
  exigir(archivoId, 404, 'NO_ENCONTRADO', 'Archivo no disponible.');
  const file = await Archivos.findOne({ where: { id: archivoId, tipo: esperado, estado: 'DISPONIBLE' } });
  exigir(file, 404, 'NO_ENCONTRADO', 'Archivo no disponible.');
  const now = await ahoraDB(), ends = limites.filter(Boolean);
  const restante = ends.length ? Math.min(...ends.map(date => date.getTime())) - now.getTime() : null;
  exigir(restante === null || restante > 0, 404, 'NO_ENCONTRADO', 'El acceso ya venció.');
  return { file, restante_ms: restante };
}
export function controladorArchivoCampus(tipo) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      camposPermitidos(req.query, [], { vacio: true });
      const session = await alumno(req), initial = await referencia(req, session, tipo);
      await servirArchivo(req, res, initial.file, { revisionMs: 1000, vigente: async () => {
        const actual = await alumno(req), current = await referencia(req, actual, tipo);
        return { permitido: current.file.id === initial.file.id && actual.id === session.id
          && actual.usuario.id === session.usuario.id, restante_ms: current.restante_ms };
      } });
    } catch (error) {
      if (res.headersSent || res.destroyed) { if (!res.destroyed) res.destroy(); return; }
      if (error.status === 401) cookieSesion(res);
      for (const name of ['Content-Length', 'Content-Range', 'Content-Disposition', 'Accept-Ranges', 'Content-Type']) res.removeHeader(name);
      return responderError(error, res);
    }
  };
}
