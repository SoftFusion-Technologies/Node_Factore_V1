/* Benjamin Orellana - 05/10/2026 - Administración de archivos privados de Factor E. */
import { Op } from 'sequelize';
import ArchivosModel from '../../Models/Archivo/MD_TB_Archivos.js';
import { controlador,administrador,responderError } from '../../utils/http.utils.js';
import { id,entero,opcion,camposPermitidos,exigir } from '../../utils/validacion.utils.js';
import { consulta,busqueda,listar } from '../../utils/listados.utils.js';
import { conAuditoria } from '../../Services/Sistema/auditoria.service.js';
import { conContenido } from '../../Services/Curso/contenido.service.js';
import { atributosArchivo,bloquearArchivos,referenciasArchivo,encolarSinReferencias } from '../../Services/Archivo/archivoReferencias.service.js';
import { recibirArchivo,moverArchivo,limpiarSubida } from '../../Services/Archivo/subidaArchivo.service.js';
import { descartarSubida } from '../../Services/Archivo/recuperacionArchivo.service.js';
import { servirArchivo } from '../../Services/Archivo/contenidoArchivo.service.js';
import { tipoArchivo } from '../../Services/Archivo/formatosArchivo.service.js';
import { sesionVigente } from '../../Security/auth.js';
const atributos=[...atributosArchivo,'subido_por','creado_en','actualizado_en','eliminado_en'];
const estados=['SUBIENDO','DISPONIBLE','PENDIENTE_ELIMINACION','ELIMINADO'];
function publico(file) {return Object.fromEntries(atributos.map(key=>[key,file.get(key)]));}

export const OBRS_Archivos_CTS = controlador(async req=>{
  const query=consulta(req.query,['tipo','estado']),where={};
  if(query.tipo!==undefined) where.tipo=tipoArchivo(query.tipo);
  if(query.estado!==undefined) where.estado=opcion(query.estado,'estado',estados);
  const q=busqueda(query.q);if(q) where.nombre_original={[Op.like]:`%${q}%`};
  return listar(ArchivosModel,query,{where,attributes:atributos},['id','nombre_original','tipo','tamanio_bytes','creado_en','actualizado_en'],'id');
});
export const OBRS_DetArchivo_CTS = controlador(async req=>{
  const file=await ArchivosModel.findByPk(id(req.params?.id),{attributes:atributos});
  exigir(file,404,'NO_ENCONTRADO','Archivo no encontrado.');return {data:file};
});
export const OBRS_ReferenciasArchivo_CTS = controlador(async req=>{
  const archivoId=id(req.params?.id),file=await ArchivosModel.findByPk(archivoId,{attributes:['id']});
  exigir(file,404,'NO_ENCONTRADO','Archivo no encontrado.');
  const referencias=await referenciasArchivo(archivoId);
  return {data:{id:archivoId,referencias,total:Object.values(referencias).reduce((a,b)=>a+b,0)}};
});
export const CR_Archivo_CTS = controlador(async (req,actor)=>{
  const upload=await recibirArchivo(req);let prepared=null;
  try {
    prepared=await conAuditoria(req,actor,'ARCHIVO_CARGA_PREPARADA','archivos',async transaction=>{
      exigir(!req.aborted,422,'CARGA_INTERRUMPIDA','La carga fue interrumpida.');
      const file=await ArchivosModel.create({uuid:upload.uuid,tipo:upload.tipo,nombre_original:upload.nombre,
        nombre_guardado:`${upload.uuid}.${upload.extension}`,ruta_relativa:`${{VIDEO:'videos',IMAGEN:'imagenes',DOCUMENTO:'documentos'}[upload.tipo]}/${upload.uuid}.${upload.extension}`,
        mime_type:upload.mime,extension:upload.extension,tamanio_bytes:String(upload.size),sha256:upload.sha256,estado:'SUBIENDO',subido_por:actor.id},{transaction});
      await file.reload({transaction});return {entidadId:file.id,data:file,detalle:{tipo:file.tipo,tamanio_bytes:String(upload.size)}};
    });
    await moverArchivo(upload);
    const result=await conAuditoria(req,actor,'ARCHIVO_SUBIDO','archivos',async transaction=>{
      exigir(!req.aborted,422,'CARGA_INTERRUMPIDA','La carga fue interrumpida.');
      const file=await ArchivosModel.findByPk(prepared.id,{transaction,lock:transaction.LOCK.UPDATE});
      exigir(file?.estado==='SUBIENDO',409,'ARCHIVO_ESTADO','La carga ya cambió de estado.');
      await file.update({estado:'DISPONIBLE'},{transaction});
      await file.reload({transaction,attributes:atributos});
      return {entidadId:file.id,data:publico(file),detalle:{tipo:file.tipo,tamanio_bytes:String(upload.size)}};
    });
    return {status:201,message:'Archivo subido correctamente.',data:result};
  } catch(error) {
    if(prepared) {
      try {await descartarSubida(prepared.id);}
      catch(cleanup) {console.error(JSON.stringify({event:'SUBIDA_RECUPERACION_PENDIENTE',id:String(prepared.id),code:cleanup.original?.code||cleanup.code||cleanup.name}));}
    }
    throw error;
  } finally {await limpiarSubida(upload);}
});
export const UR_DuracionArchivo_CTS = controlador(async (req,actor)=>{
  const archivoId=id(req.params?.id),body=camposPermitidos(req.body,['duracion_segundos']);
  const duration=body.duracion_segundos===null?null:entero(body.duracion_segundos,'duracion_segundos',1,4294967295);
  const file=await conAuditoria(req,actor,'ARCHIVO_DURACION_ACTUALIZADA','archivos',async transaction=>{
    const row=await ArchivosModel.findByPk(archivoId,{transaction,lock:transaction.LOCK.UPDATE});
    exigir(row,404,'NO_ENCONTRADO','Archivo no encontrado.');
    exigir(row.tipo==='VIDEO'&&row.estado==='DISPONIBLE',409,'ARCHIVO_ESTADO','Editar duración solo en videos disponibles.');
    await row.update({duracion_segundos:duration},{transaction});await row.reload({transaction,attributes:atributos});
    return {entidadId:row.id,data:publico(row),detalle:{campos:['duracion_segundos']}};
  });
  return {message:'Duración actualizada.',data:file};
});
export const ER_Archivo_CTS = controlador(async (req,actor)=>{
  camposPermitidos(req.body,[],{vacio:true});const archivoId=id(req.params?.id);
  return conContenido(req,actor,'ARCHIVO_ELIMINACION_SOLICITADA','archivos',async transaction=>{
    const files=await bloquearArchivos([archivoId],transaction),file=files.get(archivoId);
    exigir(file,404,'NO_ENCONTRADO','Archivo no encontrado.');
    exigir(file.estado!=='SUBIENDO',409,'ARCHIVO_ESTADO','La carga aún no está disponible.');
    const refs=await referenciasArchivo(archivoId,transaction);
    exigir(!Object.values(refs).some(count=>count>0),409,'ARCHIVO_EN_USO','Quitar primero las referencias del archivo.');
    const trabajos=await encolarSinReferencias([archivoId],actor.id,transaction,files);
    return {entidadId:file.id,data:{id:archivoId},trabajos,detalle:{tipo:file.tipo}};
  },200,'Solicitud de eliminación procesada.');
});
// Solo administrador por ahora. El acceso del alumno se conectará con campus/sesiones.
export async function OBRS_ContenidoArchivo_CTS(req,res) {
  try {
    await administrador(req);
    const file=await ArchivosModel.findByPk(id(req.params?.id));
    exigir(file,404,'NO_ENCONTRADO','Archivo no encontrado.');
    await servirArchivo(req,res,file,{vigente:async()=>{
      await administrador(req);
      if(req.session!==undefined&&!await sesionVigente(req)) return false;
      return (await ArchivosModel.findByPk(file.id,{attributes:['estado']}))?.estado==='DISPONIBLE';
    }});
  } catch(error) {
    if(res.headersSent||res.destroyed) {if(!res.destroyed) res.destroy();return;}
    for(const name of ['Content-Length','Content-Range','Content-Disposition','Accept-Ranges','Content-Type']) res.removeHeader(name);
    return responderError(error,res);
  }
}
