/* Benjamin Orellana - 05/10/2026 - Streaming privado y rangos HTTP simples. */
import { pipeline } from 'node:stream/promises';
import { abrirArchivo } from './rutasArchivo.service.js';
import { formatos } from './formatosArchivo.service.js';
import { exigir, ErrorHttp } from '../../utils/validacion.utils.js';

export function rangoBytes(value,size) {
  if(value===undefined) return null;
  if(typeof value!=='string' || !/^bytes=\d*-\d*$/.test(value)) return false;
  const [a,b]=value.slice(6).split('-');
  if((!a&&!b)||size<=0) return false;
  const total=BigInt(size);
  if(!a) {const suffix=BigInt(b);if(!suffix) return false;return {start:Number(suffix>=total?0n:total-suffix),end:size-1};}
  const start=BigInt(a),end=b?BigInt(b):total-1n;
  if(start>=total||end<start) return false;
  return {start:Number(start),end:Number(end>=total?total-1n:end)};
}
export async function servirArchivo(req,res,file,{vigente,revisionMs=5000}={}) {
  exigir(['GET','HEAD'].includes(req.method),405,'METODO_INVALIDO','Usar GET o HEAD.');
  exigir(file.estado==='DISPONIBLE',404,'ARCHIVO_NO_DISPONIBLE','El archivo no está disponible.');
  const mime=formatos[file.tipo]?.[file.extension];
  exigir(mime && mime===file.mime_type,404,'ARCHIVO_NO_DISPONIBLE','El archivo no está disponible.');
  let opened;
  try {opened=await abrirArchivo(file.ruta_relativa);}
  catch(error) {if(error.code==='ENOENT'||error.code==='ELOOP'||error instanceof ErrorHttp) throw new ErrorHttp(404,'ARCHIVO_NO_DISPONIBLE','El archivo no está disponible en el servidor.');throw error;}
  const {handle,stat}=opened;let timer=null,expiryTimer=null,source=null,checking=false,closed=false;
  async function comprobar() {
    if(!vigente) return true;
    const began=performance.now(),value=await vigente();
    const valido=typeof value==='object'&&value!==null?value.permitido===true:value===true;
    if(expiryTimer) {clearTimeout(expiryTimer);expiryTimer=null;}
    if(!valido) return false;
    if(!closed&&!res.destroyed&&!res.writableFinished&&value?.restante_ms!==undefined&&value.restante_ms!==null) {
      if(!Number.isFinite(value.restante_ms)||value.restante_ms<=0) return false;
      // Revalidar al llegar al vencimiento: una renovación puede haberlo extendido.
      const delay=Math.min(2147483647,Math.max(1,value.restante_ms-(performance.now()-began)));
      expiryTimer=setTimeout(revisar,delay);expiryTimer.unref();
    }
    return true;
  }
  async function revisar() {
    if(checking||closed||res.destroyed||res.writableFinished) return;checking=true;
    try {if(!await comprobar()) res.destroy();} catch {res.destroy();} finally {checking=false;}
  }
  try {
    exigir(BigInt(stat.size)===BigInt(file.tamanio_bytes),409,'ARCHIVO_INCONSISTENTE','El tamaño físico no coincide con sus metadatos.');
    exigir(await comprobar(),403,'ACCESO_NO_VIGENTE','El acceso ya no está habilitado.');
    const range=rangoBytes(req.headers?.range,stat.size);
    res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type',mime);
    const name=String(file.nombre_original).replace(/[\x00-\x1f\x7f]/g,'');
    res.setHeader('Content-Disposition',`${file.tipo==='DOCUMENTO'?'attachment':'inline'}; filename="archivo.${file.extension}"; filename*=UTF-8''${encodeURIComponent(name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`);
    if(range===false) {res.setHeader('Content-Range',`bytes */${stat.size}`);res.status(416).end();return;}
    if(range) {res.status(206);res.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${stat.size}`);}
    res.setHeader('Content-Length',String(range?range.end-range.start+1:stat.size));
    if(req.method==='HEAD') {res.end();return;}
    source=handle.createReadStream({...range??{},autoClose:false});
    if(vigente) {
      timer=setInterval(revisar,revisionMs);timer.unref();
    }
    await pipeline(source,res);
  } finally {closed=true;if(timer) clearInterval(timer);if(expiryTimer) clearTimeout(expiryTimer);source?.destroy();await handle.close();}
}
