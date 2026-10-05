/* Benjamin Orellana - 05/10/2026 - Formatos admitidos y firma básica de contenido. */
import path from 'node:path';
import yauzl from 'yauzl';
import { exigir, opcion } from '../../utils/validacion.utils.js';

export const formatos = {
  VIDEO:{mp4:'video/mp4',webm:'video/webm'},
  IMAGEN:{jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'},
  DOCUMENTO:{pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
};
export function tipoArchivo(value) {return opcion(value,'tipo',['VIDEO','IMAGEN','DOCUMENTO']);}
export function nombreArchivo(value,tipo,mime) {
  tipoArchivo(tipo);
  exigir(typeof value==='string' && !/[\x00-\x1f\x7f]/.test(value),422,'NOMBRE_ARCHIVO','Nombre de archivo inválido.');
  const nombre=value.replaceAll('\\','/').split('/').at(-1).trim();
  exigir(nombre.length>0 && [...nombre].length<=255,422,'NOMBRE_ARCHIVO','Nombre de archivo vacío o demasiado largo.');
  const extension=path.extname(nombre).slice(1).toLowerCase();
  exigir(Object.hasOwn(formatos[tipo],extension),422,'FORMATO_INVALIDO','Formato de archivo no permitido para ese tipo.');
  const canonical=formatos[tipo][extension];
  exigir(mime===canonical || mime==='application/octet-stream',422,'MIME_INVALIDO','El tipo informado no corresponde a la extensión.');
  return {nombre,extension,mime:canonical};
}
export function firmaValida(extension,bytes) {
  if(['jpg','jpeg'].includes(extension)) return bytes.length>=4 && bytes.subarray(0,3).equals(Buffer.from([255,216,255]));
  if(extension==='png') return bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16)==='IHDR';
  if(extension==='webp') return bytes.length>=16 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' && ['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16));
  if(extension==='mp4') return bytes.length>=16 && bytes.readUInt32BE(0)>=16 && bytes.toString('ascii',4,8)==='ftyp';
  if(extension==='webm') return bytes.length>=8 && bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  if(extension==='pdf') return bytes.length>=8 && /^%PDF-[12]\.[0-9]/.test(bytes.toString('ascii',0,8));
  if(['docx','xlsx'].includes(extension)) return bytes.length>=4 && bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]));
  return false;
}
export async function validarOffice(filename,extension) {
  const zip = await new Promise((resolve,reject)=>yauzl.open(filename,{lazyEntries:true,autoClose:true,validateEntrySizes:true,strictFileNames:true},(error,file)=>error?reject(error):resolve(file)));
  try {
    await new Promise((resolve,reject)=>{
      const names = new Set();let entries=0,total=0;
      const fail=error=>{zip.close();reject(error);};
      zip.on('error',fail);
      zip.on('entry',entry=>{
        try {
          entries++;total+=entry.uncompressedSize;
          exigir(entries<=5000 && total<=512*1024*1024 && entry.uncompressedSize<=64*1024*1024,422,'OFFICE_INVALIDO','Documento Office demasiado complejo.');
          exigir(!names.has(entry.fileName) && !(entry.generalPurposeBitFlag&1) && !/vbaProject\.bin$/i.test(entry.fileName),422,'OFFICE_INVALIDO','Documento Office no admitido.');
          names.add(entry.fileName);
          if(entry.fileName.endsWith('/')) {zip.readEntry();return;}
          zip.openReadStream(entry,(error,stream)=>{
            if(error) {fail(error);return;}
            (async()=>{
              // Descomprimir por streaming permite detectar entradas truncadas/falsificadas.
              for await(const chunk of stream) { /* sin extracción ni acumulación */ }
              zip.readEntry();
            })().catch(fail);
          });
        } catch(error) {fail(error);}
      });
      zip.on('end',()=>{
        try {
          const required = extension==='docx' ? 'word/document.xml' : 'xl/workbook.xml';
          exigir(names.has('[Content_Types].xml') && names.has(required),422,'OFFICE_INVALIDO','El contenido no corresponde al documento Office.');
          resolve();
        } catch(error) {reject(error);}
      });
      zip.readEntry();
    });
  } finally {zip.close();}
}
