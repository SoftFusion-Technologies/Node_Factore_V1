/* Benjamin Orellana - 05/10/2026 - Raíz privada, carpetas y rutas de archivos. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { exigir } from '../../utils/validacion.utils.js';

export function storageRoot() {
  return path.resolve(fileURLToPath(new URL('../../../',import.meta.url)),process.env.STORAGE_ROOT || '../factore-storage-desa');
}
export async function carpetaSegura(folder) {
  exigir(['videos','imagenes','documentos','.tmp'].includes(folder),409,'ARCHIVO_RUTA','Carpeta inválida.');
  const root = storageRoot(), directory = path.join(root,folder);
  const rootStat = await lstat(root), stat = await lstat(directory);
  exigir(rootStat.isDirectory() && !rootStat.isSymbolicLink() && stat.isDirectory() && !stat.isSymbolicLink(),409,'ARCHIVO_RUTA','La carpeta de archivos no es segura.');
  const resolvedRoot = await realpath(root), resolved = await realpath(directory);
  exigir(resolved === path.join(resolvedRoot,folder),409,'ARCHIVO_RUTA','Carpeta fuera del almacenamiento.');
  return resolved;
}
export async function inicializarStorage() {
  const root = storageRoot();
  await mkdir(root,{recursive:true,mode:0o700});
  const stat = await lstat(root);
  exigir(stat.isDirectory() && !stat.isSymbolicLink(),409,'ARCHIVO_RUTA','La raíz de archivos no es segura.');
  for (const folder of ['.tmp','videos','imagenes','documentos']) {
    await mkdir(path.join(root,folder),{mode:0o700}).catch(error=>{if(error.code!=='EEXIST') throw error;});
    await carpetaSegura(folder);
  }
}
export async function rutaSegura(relative,missingAllowed=false) {
  exigir(typeof relative==='string' && /^(videos|imagenes|documentos)\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.[a-z0-9]{1,10}$/.test(relative),409,'ARCHIVO_RUTA','Ubicación de archivo inválida.');
  const directory = await carpetaSegura(relative.split('/')[0]);
  const full = path.join(directory,path.basename(relative));
  try {
    const stat = await lstat(full);
    exigir(stat.isFile() && !stat.isSymbolicLink(),409,'ARCHIVO_RUTA','El archivo no es regular.');
  } catch(error) {if(error.code!=='ENOENT' || !missingAllowed) throw error;}
  return full;
}
export async function abrirArchivo(relative) {
  const handle = await open(await rutaSegura(relative),constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    exigir(stat.isFile() && stat.size>0,404,'ARCHIVO_NO_DISPONIBLE','El archivo no está disponible.');
    return {handle,stat};
  } catch(error) {await handle.close();throw error;}
}
