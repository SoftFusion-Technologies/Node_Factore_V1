/* Benjamin Orellana - 04/10/2026 - Lecciones, publicación y retiro de videos. */
import { Op } from 'sequelize';
import LeccionesModel from '../../Models/Curso/MD_TB_CursoLecciones.js';
import ModulosModel from '../../Models/Curso/MD_TB_CursoModulos.js';
import ArchivosModel from '../../Models/Archivo/MD_TB_Archivos.js';
import { controlador } from '../../utils/http.utils.js';
import { id, texto, opcion, entero, camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { curso, moduloEnCurso, conContenido } from '../../Services/Curso/contenido.service.js';
import { atributosArchivo, bloquearArchivos, validarArchivo, encolarSinReferencias } from '../../Services/Archivo/archivoReferencias.service.js';
const estados = ['BORRADOR','PUBLICADA','ARCHIVADA'];
const includes = [{model:ModulosModel,as:'modulo',attributes:['id','titulo','estado'],required:false},
  ...['video','portada'].map(as => ({model:ArchivosModel,as,attributes:atributosArchivo,required:false}))];
function validar(body,crear = false) {
  const input = camposPermitidos(body,['modulo_id','titulo','descripcion','video_archivo_id','portada_archivo_id','estado','orden']), data = {};
  if (crear) exigir(input.titulo !== undefined && input.modulo_id !== undefined,422,'DATOS_INVALIDOS','titulo y modulo_id son obligatorios.');
  for (const [name,value] of Object.entries(input)) {
    if (name === 'titulo' || name === 'descripcion') data[name] = texto(value,name,name === 'titulo' ? 180 : 50000,{nullable:name === 'descripcion',byteMax:name === 'descripcion' ? 60000 : undefined});
    else if (name === 'modulo_id') data[name] = id(value,name);
    else if (['video_archivo_id','portada_archivo_id'].includes(name)) data[name] = value === null ? null : id(value,name);
    else if (name === 'estado') data[name] = opcion(value,name,estados);
    else data.orden = entero(value,name);
  }
  return data;
}
async function validarPublicada(estado,videoId,modulo,parent,files) {
  if (estado !== 'PUBLICADA') return;
  exigir(parent.estado !== 'ARCHIVADO' && modulo.estado === 'ACTIVO',409,'CONTENIDO_ARCHIVADO','Activar el curso y el módulo antes de publicar la lección.');
  exigir(videoId,422,'LECCION_SIN_VIDEO','Una lección publicada debe tener un video disponible.');
  await validarArchivo(videoId,'VIDEO',files);
}
async function obtener(req,transaction,withIncludes = false) {
  const parent = await curso(req,transaction);
  const row = await LeccionesModel.findOne({where:{id:id(req.params?.id),curso_id:parent.id},
    ...(withIncludes ? {include:includes} : {}),...(transaction ? {transaction,lock:transaction.LOCK.UPDATE} : {})});
  exigir(row,404,'NO_ENCONTRADO','Lección no encontrada en este curso.');
  return {parent,row};
}
export const OBRS_CursoLecciones_CTS = controlador(async req => {
  const parent = await curso(req), query = consulta(req.query,['estado','modulo_id']), where = {curso_id:parent.id};
  if (query.estado !== undefined) where.estado = opcion(query.estado,'estado',estados);
  if (query.modulo_id !== undefined) {
    await moduloEnCurso(query.modulo_id,parent.id);
    where.modulo_id = id(query.modulo_id,'modulo_id');
  }
  const q = busqueda(query.q);
  if (q) where.titulo = {[Op.like]:`%${q}%`};
  return listar(LeccionesModel,query,{where,include:includes},['id','titulo','orden','creado_en','actualizado_en'],'orden');
});
export const OBRS_DetCursoLeccion_CTS = controlador(async req => ({data:(await obtener(req,undefined,true)).row}));
export const CR_CursoLeccion_CTS = controlador(async (req,actor) => {
  const data = validar(req.body,true);
  return conContenido(req,actor,'LECCION_CREADA','curso_lecciones',async transaction => {
    const parent = await curso(req,transaction,true), modulo = await moduloEnCurso(data.modulo_id,parent.id,transaction);
    const files = await bloquearArchivos([data.video_archivo_id,data.portada_archivo_id],transaction);
    await validarArchivo(data.video_archivo_id,'VIDEO',files);
    await validarArchivo(data.portada_archivo_id,'IMAGEN',files);
    await validarPublicada(data.estado,data.video_archivo_id,modulo,parent,files);
    const row = await LeccionesModel.create({...data,curso_id:parent.id},{transaction});
    await row.reload({transaction});
    return {entidadId:row.id,data:row,detalle:{curso_id:String(parent.id),campos:Object.keys(data)}};
  },201,'Lección creada correctamente.');
});
async function actualizar(req,actor,modo) {
  if (modo !== 'editar') camposPermitidos(req.body,[],{vacio:true});
  const input = modo === 'archivar' ? {estado:'ARCHIVADA'} : modo === 'retirar' ? {video_archivo_id:null} : validar(req.body);
  return conContenido(req,actor,modo === 'archivar' ? 'LECCION_ARCHIVADA' : modo === 'retirar' ? 'VIDEO_RETIRADO' : 'LECCION_ACTUALIZADA','curso_lecciones',async transaction => {
    const {parent,row} = await obtener(req,transaction), data = {...input};
    if (data.video_archivo_id === null && data.estado === undefined && row.estado === 'PUBLICADA') data.estado = 'BORRADOR';
    const modulo = await moduloEnCurso(data.modulo_id ?? row.modulo_id,parent.id,transaction);
    const files = await bloquearArchivos([row.video_archivo_id,row.portada_archivo_id,data.video_archivo_id,data.portada_archivo_id],transaction);
    if (data.video_archivo_id !== undefined) await validarArchivo(data.video_archivo_id,'VIDEO',files);
    if (data.portada_archivo_id !== undefined) await validarArchivo(data.portada_archivo_id,'IMAGEN',files);
    // Archivar o retirar el video debe funcionar aun si el contenido dejó de estar disponible.
    if (modo === 'editar' && (data.estado === 'PUBLICADA' || data.video_archivo_id !== undefined || data.modulo_id !== undefined))
      await validarPublicada(data.estado ?? row.estado,data.video_archivo_id === undefined ? row.video_archivo_id : data.video_archivo_id,modulo,parent,files);
    const anteriores = [row.video_archivo_id,row.portada_archivo_id].filter((value,index) => {
      const key = index === 0 ? 'video_archivo_id' : 'portada_archivo_id';
      return data[key] !== undefined && String(value) !== String(data[key]);
    });
    await row.update(data,{transaction});
    const trabajos = await encolarSinReferencias(anteriores,actor.id,transaction,files);
    await row.reload({transaction});
    return {entidadId:row.id,data:row,trabajos,detalle:{curso_id:String(parent.id),campos:Object.keys(data)}};
  },200,modo === 'archivar' ? 'Lección archivada correctamente.' : modo === 'retirar' ? 'Video retirado de la lección.' : 'Lección actualizada correctamente.');
}
export const UR_CursoLeccion_CTS = controlador((req,actor) => actualizar(req,actor,'editar'));
export const ER_CursoLeccion_CTS = controlador((req,actor) => actualizar(req,actor,'archivar'));
export const ER_VideoLeccion_CTS = controlador((req,actor) => actualizar(req,actor,'retirar'));
