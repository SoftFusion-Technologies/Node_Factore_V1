/* Benjamin Orellana - 05/10/2026 - Limpieza de cargas preparadas que no se completaron. */
import path from 'node:path';
import { readdir,lstat,unlink } from 'node:fs/promises';
import { Op,Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import ArchivosModel from '../../Models/Archivo/MD_TB_Archivos.js';
import AuditoriaModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { carpetaSegura } from './rutasArchivo.service.js';
import { bloquearArchivos,encolarSinReferencias,procesarTrabajos } from './archivoReferencias.service.js';

export async function descartarSubida(archivoId) {
  const jobs=await db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.READ_COMMITTED},async transaction=>{
    const files=await bloquearArchivos([archivoId],transaction),file=files.get(String(archivoId));
    if(!file || file.estado!=='SUBIENDO') return [];
    const jobs=await encolarSinReferencias([file.id],file.subido_por,transaction,files);
    if(jobs.length) await AuditoriaModel.create({usuario_id:file.subido_por,accion:'ARCHIVO_CARGA_DESCARTADA',entidad:'archivos',entidad_id:file.id,detalle:{tipo:file.tipo}},{transaction});
    return jobs;
  });
  return procesarTrabajos(jobs);
}
export async function recuperarSubidas() {
  const cutoff=new Date(Date.now()-24*60*60000);
  const rows=await ArchivosModel.findAll({where:{estado:'SUBIENDO',creado_en:{[Op.lt]:cutoff}},attributes:['id'],order:[['id','ASC']]});
  const result=[];
  for(const row of rows) result.push(...await descartarSubida(row.id));
  const directory=await carpetaSegura('.tmp');let temporalesEliminados=0;
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(!entry.isFile() || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.part$/.test(entry.name)) continue;
    const full=path.join(directory,entry.name),stat=await lstat(full);
    if(!stat.isFile() || stat.isSymbolicLink() || stat.mtimeMs>=cutoff.getTime()) continue;
    await unlink(full);temporalesEliminados++;
  }
  return {eliminaciones:result,temporales_eliminados:temporalesEliminados};
}
