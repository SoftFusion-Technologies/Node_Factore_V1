/* Benjamin Orellana - 04/10/2026 - Referencias y eliminación física de archivos privados. */
import { unlink } from 'node:fs/promises';
import { rutaSegura } from './rutasArchivo.service.js';
export { storageRoot } from './rutasArchivo.service.js';
import { Op, Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import ArchivosModel from '../../Models/Archivo/MD_TB_Archivos.js';
import ArchivosEliminacionesModel from '../../Models/Archivo/MD_TB_ArchivosEliminaciones.js';
import CursosModel from '../../Models/Curso/MD_TB_Cursos.js';
import LeccionesModel from '../../Models/Curso/MD_TB_CursoLecciones.js';
import MaterialesModel from '../../Models/Curso/MD_TB_CursoMateriales.js';
import ComerciosModel from '../../Models/Comercio/MD_TB_ComerciosAmigos.js';
import { exigir, id } from '../../utils/validacion.utils.js';

export const atributosArchivo = ['id','uuid','tipo','nombre_original','mime_type','tamanio_bytes','duracion_segundos','estado'];
const txOptions = { isolationLevel:Transaction.ISOLATION_LEVELS.READ_COMMITTED };
export async function bloquearArchivos(values, transaction) {
  const ids = [...new Set(values.filter(value => value !== null && value !== undefined).map(value => id(value)))];
  ids.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
  const files = new Map();
  for (const value of ids) files.set(value, await ArchivosModel.findByPk(value, { transaction, lock:transaction.LOCK.UPDATE }));
  return files;
}
export async function validarArchivo(value, tipo, files) {
  if (value === null || value === undefined) return;
  const file = files.get(String(value));
  exigir(file && file.tipo === tipo && file.estado === 'DISPONIBLE', 422, 'ARCHIVO_INVALIDO', 'El archivo no está disponible o su tipo no corresponde.');
  try { await rutaSegura(file.ruta_relativa); }
  catch { exigir(false, 422, 'ARCHIVO_NO_DISPONIBLE', 'El archivo no está disponible en el servidor.'); }
}
export async function referenciasArchivo(value, transaction) {
  const archivoId = id(value);
  const refs = {};
  for (const [name, model, column] of [
    ['cursos_portada',CursosModel,'portada_archivo_id'], ['lecciones_video',LeccionesModel,'video_archivo_id'],
    ['lecciones_portada',LeccionesModel,'portada_archivo_id'], ['materiales',MaterialesModel,'archivo_id'],
    ['comercios_logo',ComerciosModel,'logo_archivo_id']
  ]) refs[name] = await model.count({ where:{ [column]:archivoId }, transaction });
  return refs;
}
export async function encolarSinReferencias(values, actorId, transaction, files) {
  const jobs = [];
  for (const value of [...new Set(values.filter(Boolean).map(String))]) {
    const file = files.get(value);
    if (!file || file.estado === 'ELIMINADO') continue;
    const refs = await referenciasArchivo(value, transaction);
    if (Object.values(refs).some(count => count > 0)) continue;
    exigir(['SUBIENDO','DISPONIBLE','PENDIENTE_ELIMINACION'].includes(file.estado), 409, 'ARCHIVO_ESTADO', 'El archivo no está listo para eliminar.');
    await file.update({ estado:'PENDIENTE_ELIMINACION' }, { transaction });
    let job = await ArchivosEliminacionesModel.findOne({ where:{archivo_id:value}, transaction, lock:transaction.LOCK.UPDATE });
    if (!job) job = await ArchivosEliminacionesModel.create({ archivo_id:value, solicitado_por:actorId }, { transaction });
    jobs.push(String(job.id));
  }
  return jobs;
}
export async function procesarEliminacion(value) {
  const jobId = id(value);
  const lookup = await ArchivosEliminacionesModel.findByPk(jobId, { attributes:['id','archivo_id'] });
  if (!lookup) return 'NO_ENCONTRADA';
  const work = await db.transaction(txOptions, async transaction => {
    const file = await ArchivosModel.findByPk(lookup.archivo_id, { transaction, lock:transaction.LOCK.UPDATE });
    const job = await ArchivosEliminacionesModel.findByPk(jobId, { transaction, lock:transaction.LOCK.UPDATE });
    if (!file || !job || !['PENDIENTE','ERROR'].includes(job.estado) || file.estado !== 'PENDIENTE_ELIMINACION') return null;
    const refs = await referenciasArchivo(file.id, transaction);
    if (Object.values(refs).some(count => count > 0)) {
      await job.update({ estado:'ERROR',ultimo_error:'ARCHIVO_CON_REFERENCIAS',proximo_intento_en:new Date(Date.now()+60000) }, { transaction });
      return null;
    }
    await job.update({ estado:'EN_PROCESO',intentos:Number(job.intentos)+1,ultimo_error:null }, { transaction });
    return { archivoId:String(file.id), relative:file.ruta_relativa };
  });
  if (!work) return (await ArchivosEliminacionesModel.findByPk(jobId, {attributes:['estado']}))?.estado ?? 'NO_ENCONTRADA';
  try {
    const full = await rutaSegura(work.relative, true);
    try { await unlink(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await db.transaction(txOptions, async transaction => {
      const file = await ArchivosModel.findByPk(work.archivoId, { transaction, lock:transaction.LOCK.UPDATE });
      const job = await ArchivosEliminacionesModel.findByPk(jobId, { transaction, lock:transaction.LOCK.UPDATE });
      if (job.estado === 'COMPLETADA') return;
      await file.update({ estado:'ELIMINADO',eliminado_en:new Date() }, { transaction });
      await job.update({ estado:'COMPLETADA',completada_en:new Date(),ultimo_error:null,proximo_intento_en:null }, { transaction });
    });
    return 'COMPLETADA';
  } catch (error) {
    await ArchivosEliminacionesModel.update({ estado:'ERROR',ultimo_error:error.code || 'BORRADO_NO_COMPLETADO',
      proximo_intento_en:new Date(Date.now()+60000) }, { where:{id:jobId,estado:{[Op.ne]:'COMPLETADA'}} });
    return 'ERROR';
  }
}
export async function procesarTrabajos(values) {
  const result = [];
  for (const value of values) {
    let estado;
    try { estado = await procesarEliminacion(value); }
    catch (error) {
      console.error(JSON.stringify({event:'ELIMINACION_PENDIENTE',id:String(value),code:error.original?.code || error.code || error.name}));
      estado = 'PENDIENTE';
    }
    result.push({id:String(value),estado});
  }
  return result;
}
export async function reintentarEliminaciones() {
  await ArchivosEliminacionesModel.update({estado:'ERROR',ultimo_error:'REINTENTO_TRAS_INTERRUPCION',proximo_intento_en:null},
    {where:{estado:'EN_PROCESO',actualizado_en:{[Op.lt]:new Date(Date.now()-10*60000)}}});
  const jobs = await ArchivosEliminacionesModel.findAll({where:{estado:{[Op.in]:['PENDIENTE','ERROR']},
    [Op.or]:[{proximo_intento_en:null},{proximo_intento_en:{[Op.lte]:new Date()}}]},attributes:['id'],order:[['id','ASC']]});
  return procesarTrabajos(jobs.map(job => job.id));
}
