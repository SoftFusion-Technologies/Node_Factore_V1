/* Benjamin Orellana - 06/10/2026 - Diagnóstico de DESA; consultas y lecturas de disco. */
import { QueryTypes } from 'sequelize';
import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import db from '../../DataBase/db.js';
import { abrirArchivo, carpetaSegura, rutaSegura } from '../Archivo/rutasArchivo.service.js';
import { limpiarCredenciales } from './limpiezaCredenciales.service.js';

// Las consultas son constantes; no reciben identificadores SQL del usuario.
export const comprobaciones = [
  ['ALUMNOS_SIN_FICHA', `SELECT COUNT(*) AS cantidad FROM usuarios WHERE rol='ALUMNO' AND cliente_id IS NULL`],
  ['CUENTAS_ACTIVAS_SIN_PASSWORD', `SELECT COUNT(*) AS cantidad FROM usuarios WHERE estado='ACTIVO' AND (password_hash IS NULL OR password_hash='')`],
  ['ACCESOS_A_ADMINISTRADORES', `SELECT COUNT(*) AS cantidad FROM curso_accesos a JOIN usuarios u ON u.id=a.usuario_id WHERE u.rol<>'ALUMNO'`],
  ['SELECCION_ACTIVA_VACIA', `SELECT COUNT(*) AS cantidad FROM curso_accesos a WHERE a.estado='ACTIVO' AND a.alcance='SELECCION' AND NOT EXISTS (SELECT 1 FROM curso_acceso_lecciones al WHERE al.acceso_id=a.id AND al.estado='HABILITADA')`],
  ['LECCIONES_PUBLICADAS_SIN_VIDEO', `SELECT COUNT(*) AS cantidad FROM curso_lecciones l LEFT JOIN archivos a ON a.id=l.video_archivo_id WHERE l.estado='PUBLICADA' AND (a.id IS NULL OR a.tipo<>'VIDEO' OR a.estado<>'DISPONIBLE')`],
  ['MATERIALES_INVALIDOS', `SELECT COUNT(*) AS cantidad FROM curso_materiales m LEFT JOIN archivos a ON a.id=m.archivo_id WHERE a.id IS NULL OR a.tipo<>'DOCUMENTO' OR a.estado<>'DISPONIBLE'`],
  ['IMAGENES_INVALIDAS', `SELECT COUNT(*) AS cantidad FROM (
    SELECT portada_archivo_id AS archivo_id FROM cursos WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT portada_archivo_id FROM curso_lecciones WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT logo_archivo_id FROM comercios_amigos WHERE logo_archivo_id IS NOT NULL
  ) r LEFT JOIN archivos a ON a.id=r.archivo_id WHERE a.id IS NULL OR a.tipo<>'IMAGEN' OR a.estado<>'DISPONIBLE'`],
  ['PROGRESO_INCOHERENTE', `SELECT COUNT(*) AS cantidad FROM leccion_progreso WHERE (estado='COMPLETADA' AND completada_en IS NULL) OR (estado='EN_CURSO' AND completada_en IS NOT NULL)`],
  ['PROGRESO_DUPLICADO', `SELECT COUNT(*) AS cantidad FROM (SELECT usuario_id,leccion_id FROM leccion_progreso GROUP BY usuario_id,leccion_id HAVING COUNT(*)>1) d`],
  ['ELIMINADOS_SIN_COMPROBANTE', `SELECT COUNT(*) AS cantidad FROM archivos a WHERE a.estado='ELIMINADO' AND NOT EXISTS (SELECT 1 FROM archivos_eliminaciones e WHERE e.archivo_id=a.id AND e.estado='COMPLETADA')`],
  ['COMPROBANTES_INCOHERENTES', `SELECT COUNT(*) AS cantidad FROM archivos_eliminaciones e JOIN archivos a ON a.id=e.archivo_id WHERE e.estado='COMPLETADA' AND a.estado<>'ELIMINADO'`],
  ['REFERENCIAS_A_ARCHIVOS_RETIRADOS', `SELECT COUNT(*) AS cantidad FROM (
    SELECT video_archivo_id AS archivo_id FROM curso_lecciones WHERE video_archivo_id IS NOT NULL
    UNION ALL SELECT portada_archivo_id FROM curso_lecciones WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT portada_archivo_id FROM cursos WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT logo_archivo_id FROM comercios_amigos WHERE logo_archivo_id IS NOT NULL
    UNION ALL SELECT archivo_id FROM curso_materiales
  ) r JOIN archivos a ON a.id=r.archivo_id WHERE a.estado IN ('SUBIENDO','PENDIENTE_ELIMINACION','ELIMINADO')`],
  ['CAMPUS_CON_ACCESO_INVALIDO', `SELECT COUNT(*) AS cantidad FROM vw_campus_lecciones_habilitadas h
    JOIN curso_accesos a ON a.id=h.acceso_id JOIN usuarios u ON u.id=h.usuario_id
    JOIN crm_clientes cl ON cl.id=u.cliente_id JOIN cursos c ON c.id=h.curso_id
    JOIN curso_lecciones l ON l.id=h.leccion_id JOIN curso_modulos m ON m.id=l.modulo_id
    JOIN archivos av ON av.id=l.video_archivo_id
    LEFT JOIN curso_acceso_lecciones al ON al.acceso_id=a.id AND al.leccion_id=l.id
    WHERE a.estado<>'ACTIVO' OR a.inicio_en>UTC_TIMESTAMP(3) OR (a.vence_en IS NOT NULL AND a.vence_en<=UTC_TIMESTAMP(3))
      OR u.rol<>'ALUMNO' OR u.estado<>'ACTIVO' OR cl.activo<>1 OR c.estado<>'PUBLICADO'
      OR m.estado<>'ACTIVO' OR l.estado<>'PUBLICADA' OR av.tipo<>'VIDEO' OR av.estado<>'DISPONIBLE'
      OR (a.alcance='SELECCION' AND al.id IS NULL)
      OR (al.id IS NOT NULL AND (al.estado<>'HABILITADA' OR al.inicio_en>UTC_TIMESTAMP(3) OR al.vence_en<=UTC_TIMESTAMP(3)))`],
  ['CAMPUS_COMERCIOS_OCULTOS', `SELECT COUNT(*) AS cantidad FROM vw_campus_comercios_visibles v JOIN comercios_amigos c ON c.id=v.id WHERE c.activo<>1 OR c.mostrar_a_usuarios<>1`],
  ['PORCENTAJES_INVALIDOS', `SELECT COUNT(*) AS cantidad FROM vw_campus_progreso_cursos WHERE lecciones_habilitadas<1 OR lecciones_completadas<0 OR lecciones_completadas>lecciones_habilitadas OR porcentaje<0 OR porcentaje>100`]
];

export const avisos = [
  ['ELIMINACIONES_PENDIENTES', `SELECT COUNT(*) AS cantidad FROM archivos_eliminaciones WHERE estado<>'COMPLETADA'`],
  ['SUBIDAS_ABANDONADAS', `SELECT COUNT(*) AS cantidad FROM archivos WHERE estado='SUBIENDO' AND creado_en<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)`],
  ['CURSOS_PUBLICADOS_SIN_CONTENIDO_APTO', `SELECT COUNT(*) AS cantidad FROM cursos c WHERE c.estado='PUBLICADO' AND NOT EXISTS (
    SELECT 1 FROM curso_lecciones l JOIN curso_modulos m ON m.id=l.modulo_id AND m.curso_id=l.curso_id
    JOIN archivos a ON a.id=l.video_archivo_id WHERE l.curso_id=c.id AND l.estado='PUBLICADA'
      AND m.estado='ACTIVO' AND a.tipo='VIDEO' AND a.estado='DISPONIBLE')`]
];

async function contar(consultas) {
  const result = {};
  for (const [codigo, sql] of consultas) {
    const [row] = await db.query(sql, { type: QueryTypes.SELECT });
    result[codigo] = String(row.cantidad);
  }
  return result;
}

export async function verificarArchivoDesa(archivo, { hash = false } = {}) {
  const issue = codigo => ({ archivo_id: String(archivo.id), codigo });
  let opened;
  try {
    if (archivo.estado === 'ELIMINADO') {
      const filename = await rutaSegura(archivo.ruta_relativa, true);
      try { await lstat(filename); return issue('ELIMINADO_PRESENTE_EN_DISCO'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    const folder = { VIDEO: 'videos', IMAGEN: 'imagenes', DOCUMENTO: 'documentos' }[archivo.tipo];
    if (!folder || !archivo.ruta_relativa?.startsWith(folder + '/')) return issue('TIPO_CARPETA_INCOHERENTE');
    opened = await abrirArchivo(archivo.ruta_relativa);
    if (BigInt(opened.stat.size) !== BigInt(archivo.tamanio_bytes)) return issue('TAMANIO_DISTINTO');
    if (hash) {
      if (!/^[a-f0-9]{64}$/.test(archivo.sha256 || '')) return issue('SHA256_AUSENTE_O_INVALIDO');
      const digest = createHash('sha256');
      for await (const chunk of opened.handle.createReadStream({ autoClose: false })) digest.update(chunk);
      const after = await opened.handle.stat();
      if (after.size !== opened.stat.size || after.mtimeMs !== opened.stat.mtimeMs) return issue('ARCHIVO_CAMBIO_DURANTE_LECTURA');
      if (digest.digest('hex') !== archivo.sha256) return issue('SHA256_DISTINTO');
    }
    return null;
  } catch (error) {
    return issue(error.code === 'ENOENT' ? 'ARCHIVO_FISICO_AUSENTE' : 'ARCHIVO_NO_VERIFICABLE');
  } finally { if (opened) await opened.handle.close(); }
}

export async function validarDesa({ hash = false } = {}) {
  if (typeof hash !== 'boolean') throw new Error('VALIDACION_OPCIONES_INVALIDAS');
  const errores = await contar(comprobaciones), advertencias = await contar(avisos);
  const credenciales = await limpiarCredenciales({ aplicar: false });
  const storage = { carpetas_revisadas: 0, archivos_revisados: '0', incidencias: [], incidencias_total: '0', muestras_limitadas_a: 20, hash };
  let incidencias = 0n, revisados = 0n;
  const registrar = issue => {
    incidencias++;
    if (storage.incidencias.length < 20) storage.incidencias.push(issue);
  };
  for (const folder of ['videos', 'imagenes', 'documentos', '.tmp']) {
    try { await carpetaSegura(folder); storage.carpetas_revisadas++; }
    catch { registrar({ codigo: 'CARPETA_NO_VERIFICABLE', carpeta: folder }); }
  }
  // Recorrer todo el conjunto con paginación por PK; BIGINT nunca pasa por Number.
  let ultimoId = '0';
  for (;;) {
    const rows = await db.query(`SELECT CAST(a.id AS CHAR) AS id, tipo, estado, ruta_relativa,
      CAST(tamanio_bytes AS CHAR) AS tamanio_bytes, sha256 FROM archivos a
      WHERE a.id>:ultimoId AND estado IN ('DISPONIBLE','ELIMINADO') ORDER BY a.id LIMIT 200`,
    { replacements: { ultimoId }, type: QueryTypes.SELECT });
    if (!rows.length) break;
    for (const row of rows) {
      const issue = await verificarArchivoDesa(row, { hash });
      if (issue) registrar(issue);
      revisados++;
    }
    ultimoId = String(rows.at(-1).id);
  }
  storage.archivos_revisados = revisados.toString();
  storage.incidencias_total = incidencias.toString();
  const ok = Object.values(errores).every(n => n === '0') && incidencias === 0n;
  return { ok, modo: 'SOLO_LECTURA', errores, advertencias, almacenamiento: storage,
    credenciales: { retencion_dias: credenciales.retencion_dias, candidatos: credenciales.candidatos, eliminados: credenciales.eliminados } };
}
