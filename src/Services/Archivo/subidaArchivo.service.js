/* Benjamin Orellana - 05/10/2026 - Multipart por streaming con temporales privados. */
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, unlink, link } from 'node:fs/promises';
import busboy from 'busboy';
import { ErrorHttp, exigir } from '../../utils/validacion.utils.js';
import { inicializarStorage, carpetaSegura } from './rutasArchivo.service.js';
import { nombreArchivo, tipoArchivo, firmaValida, validarOffice } from './formatosArchivo.service.js';

function configuracion(name,fallback,min,max) {
  const text=process.env[name];
  const value=text===undefined ? fallback : Number(text);
  exigir(Number.isSafeInteger(value) && value>=min && value<=max,500,'STORAGE_CONFIGURACION','Configuración de almacenamiento inválida.');
  return value;
}
export function limiteArchivo(tipo) {
  tipoArchivo(tipo);
  const [name,fallback] = {VIDEO:['MAX_VIDEO_BYTES',1024**3],IMAGEN:['MAX_IMAGE_BYTES',10*1024**2],DOCUMENTO:['MAX_DOCUMENT_BYTES',25*1024**2]}[tipo];
  return configuracion(name,fallback,1,10*1024**3);
}
export async function recibirArchivo(req) {
  const tipo=tipoArchivo(req.params?.tipo),limit=limiteArchivo(tipo);
  exigir(typeof req.pipe==='function' && typeof req.on==='function',422,'MULTIPART_INVALIDO','Se requiere una petición multipart.');
  exigir(!req.aborted && !req.destroyed,422,'CARGA_INTERRUMPIDA','La carga fue interrumpida.');
  exigir(typeof req.headers?.['content-type']==='string' && /^multipart\/form-data\b/i.test(req.headers['content-type']),415,'MULTIPART_INVALIDO','Usar multipart/form-data con el campo archivo.');
  const contentLength=req.headers['content-length'];
  if(contentLength!==undefined) exigir(/^\d+$/.test(String(contentLength)) && BigInt(contentLength)<=BigInt(limit+65536),413,'ARCHIVO_TAMANIO','La petición supera el tamaño permitido.');
  let parser;
  try {parser=busboy({headers:req.headers,defParamCharset:'utf8',limits:{files:1,fields:0,parts:2,fileSize:limit+1,fieldNameSize:30,headerPairs:50}});}
  catch {throw new ErrorHttp(422,'MULTIPART_INVALIDO','Cabecera multipart inválida.');}
  await inicializarStorage();
  const tempDirectory=await carpetaSegura('.tmp');
  exigir(!req.aborted && !req.destroyed,422,'CARGA_INTERRUMPIDA','La carga fue interrumpida.');
  const uuid=randomUUID(),temporary=path.join(tempDirectory,`${uuid}.part`);
  let received=null,task=null,firstError=null,bytesRequest=0,currentStream=null;
  const timeout=configuracion('UPLOAD_TIMEOUT_MS',30*60000,1000,2*60*60000);
  let finish,fail;
  const parsing=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
  function abort(error) {
    if(firstError) return;
    firstError=error;
    req.unpipe(parser);currentStream?.destroy(error);parser.destroy();req.resume();fail(error);
  }
  const requestError=()=>abort(new ErrorHttp(422,'CARGA_INTERRUMPIDA','La carga fue interrumpida.'));
  const count=chunk=>{bytesRequest+=chunk.length;if(bytesRequest>limit+65536) abort(new ErrorHttp(413,'ARCHIVO_TAMANIO','La petición supera el tamaño permitido.'));};
  const timer=setTimeout(()=>abort(new ErrorHttp(408,'CARGA_TIEMPO','La carga superó el tiempo permitido.')),timeout);timer.unref();
  req.on('aborted',requestError);req.on('error',requestError);req.on('data',count);
  parser.on('error',()=>abort(new ErrorHttp(422,'MULTIPART_INVALIDO','Carga multipart incompleta o inválida.')));
  parser.on('filesLimit',()=>abort(new ErrorHttp(422,'MULTIPART_INVALIDO','Enviar exactamente un archivo.')));
  parser.on('fieldsLimit',()=>abort(new ErrorHttp(422,'CAMPO_NO_PERMITIDO','No enviar campos adicionales.')));
  parser.on('partsLimit',()=>abort(new ErrorHttp(422,'MULTIPART_INVALIDO','Demasiadas partes en la carga.')));
  parser.on('close',()=>finish());
  parser.on('file',(field,stream,info)=>{
    currentStream=stream;stream.on('error',()=>{});
    task=(async()=>{
      exigir(field==='archivo' && !received,422,'MULTIPART_INVALIDO','Usar únicamente el campo archivo.');
      const metadata=nombreArchivo(info.filename,tipo,info.mimeType);
      exigir(['7bit','8bit','binary'].includes(info.encoding),422,'MULTIPART_INVALIDO','Codificación de archivo no admitida.');
      const handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      let size=0,head=Buffer.alloc(0);const hash=createHash('sha256');
      try {
        for await(const chunk of stream) {
          size+=chunk.length;exigir(size<=limit,413,'ARCHIVO_TAMANIO','El archivo supera el tamaño permitido.');
          if(head.length<64) head=Buffer.concat([head,chunk.subarray(0,64-head.length)]);
          hash.update(chunk);await handle.writeFile(chunk);
        }
        exigir(!stream.truncated && size>0,stream.truncated?413:422,stream.truncated?'ARCHIVO_TAMANIO':'ARCHIVO_VACIO','Enviar un archivo completo y no vacío.');
        exigir(firmaValida(metadata.extension,head),422,'FORMATO_INVALIDO','El contenido no corresponde al formato del archivo.');
        await handle.sync();
      } finally {await handle.close();}
      if(['docx','xlsx'].includes(metadata.extension)) {
        try {await validarOffice(temporary,metadata.extension);}
        catch(error) {if(error instanceof ErrorHttp) throw error;throw new ErrorHttp(422,'OFFICE_INVALIDO','Documento Office inválido.');}
      }
      received={...metadata,tipo,uuid,temporary,size,sha256:hash.digest('hex')};
    })().catch(error=>{abort(error);});
  });
  try {
    req.pipe(parser);await parsing;if(task) await task;
    if(firstError) throw firstError;
    exigir(received,422,'ARCHIVO_VACIO','Enviar un archivo en el campo archivo.');
    return received;
  } catch(error) {
    if(task) await task;
    await unlink(temporary).catch(cleanup=>{if(cleanup.code!=='ENOENT') console.error(JSON.stringify({event:'TEMPORAL_PENDIENTE',code:cleanup.code}));});
    throw error;
  } finally {
    clearTimeout(timer);req.removeListener('aborted',requestError);req.removeListener('error',requestError);req.removeListener('data',count);
  }
}
export async function moverArchivo(upload) {
  const folder={VIDEO:'videos',IMAGEN:'imagenes',DOCUMENTO:'documentos'}[upload.tipo];
  const relative=`${folder}/${upload.uuid}.${upload.extension}`;
  const destination=path.join(await carpetaSegura(folder),`${upload.uuid}.${upload.extension}`);
  // link crea el destino sin sobrescribir y mantiene el temporal hasta completar MySQL.
  await link(upload.temporary,destination);
  return {relative,destination};
}
export async function limpiarSubida(upload,destination=null) {
  for(const filename of [destination,upload?.temporary].filter(Boolean)) {
    await unlink(filename).catch(error=>{if(error.code!=='ENOENT') console.error(JSON.stringify({event:'ARCHIVO_LIMPIEZA_PENDIENTE',code:error.code}));});
  }
}
