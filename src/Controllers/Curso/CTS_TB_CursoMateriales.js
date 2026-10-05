/* Benjamin Orellana - 04/10/2026 - Materiales generales y por lección de Factor E. */
import { Op } from 'sequelize';
import MaterialesModel from '../../Models/Curso/MD_TB_CursoMateriales.js';
import LeccionesModel from '../../Models/Curso/MD_TB_CursoLecciones.js';
import ArchivosModel from '../../Models/Archivo/MD_TB_Archivos.js';
import { controlador } from '../../utils/http.utils.js';
import { id, texto, bandera, entero, camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { curso, leccionEnCurso, conContenido } from '../../Services/Curso/contenido.service.js';
import { atributosArchivo, bloquearArchivos, validarArchivo, encolarSinReferencias } from '../../Services/Archivo/archivoReferencias.service.js';
const includes = [{model:LeccionesModel,as:'leccion',attributes:['id','titulo','estado'],required:false},
  {model:ArchivosModel,as:'archivo',attributes:atributosArchivo,required:false}];
function validar(body,crear = false) {
  const input = camposPermitidos(body,['leccion_id','archivo_id','titulo','activo','orden']), data = {};
  if (crear) exigir(input.titulo !== undefined && input.archivo_id !== undefined,422,'DATOS_INVALIDOS','titulo y archivo_id son obligatorios.');
  for (const [name,value] of Object.entries(input)) {
    if (name === 'titulo') data[name] = texto(value,name,180);
    else if (name === 'leccion_id') data[name] = value === null ? null : id(value,name);
    else if (name === 'archivo_id') data[name] = id(value,name);
    else if (name === 'activo') data[name] = bandera(value,name);
    else data.orden = entero(value,name);
  }
  return data;
}
async function obtener(req,transaction,withIncludes = false) {
  const parent = await curso(req,transaction);
  const row = await MaterialesModel.findOne({where:{id:id(req.params?.id),curso_id:parent.id},
    ...(withIncludes ? {include:includes} : {}),...(transaction ? {transaction,lock:transaction.LOCK.UPDATE} : {})});
  exigir(row,404,'NO_ENCONTRADO','Material no encontrado en este curso.');
  return row;
}
export const OBRS_CursoMateriales_CTS = controlador(async req => {
  const parent = await curso(req), query = consulta(req.query,['activo','leccion_id','generales']), where = {curso_id:parent.id};
  if (query.activo !== undefined) where.activo = bandera(query.activo,'activo',true);
  if (query.generales !== undefined && bandera(query.generales,'generales',true)) {
    exigir(query.leccion_id === undefined,422,'FILTRO_INVALIDO','No combinar generales con leccion_id.');
    where.leccion_id = null;
  }
  if (query.leccion_id !== undefined) {
    await leccionEnCurso(query.leccion_id,parent.id);
    where.leccion_id = id(query.leccion_id,'leccion_id');
  }
  const q = busqueda(query.q);
  if (q) where.titulo = {[Op.like]:`%${q}%`};
  return listar(MaterialesModel,query,{where,include:includes},['id','titulo','orden','creado_en'],'orden');
});
export const OBRS_DetCursoMaterial_CTS = controlador(async req => ({data:await obtener(req,undefined,true)}));
export const CR_CursoMaterial_CTS = controlador(async (req,actor) => {
  const data = validar(req.body,true);
  return conContenido(req,actor,'MATERIAL_CREADO','curso_materiales',async transaction => {
    const parent = await curso(req,transaction,true);
    await leccionEnCurso(data.leccion_id,parent.id,transaction);
    const files = await bloquearArchivos([data.archivo_id],transaction);
    await validarArchivo(data.archivo_id,'DOCUMENTO',files);
    const row = await MaterialesModel.create({...data,curso_id:parent.id},{transaction});
    await row.reload({transaction});
    return {entidadId:row.id,data:row,detalle:{curso_id:String(parent.id),campos:Object.keys(data)}};
  },201,'Material creado correctamente.');
});
export const UR_CursoMaterial_CTS = controlador(async (req,actor) => {
  const data = validar(req.body);
  return conContenido(req,actor,'MATERIAL_ACTUALIZADO','curso_materiales',async transaction => {
    const row = await obtener(req,transaction);
    if (data.leccion_id !== undefined) await leccionEnCurso(data.leccion_id,row.curso_id,transaction);
    const files = await bloquearArchivos([row.archivo_id,data.archivo_id],transaction);
    if (data.archivo_id !== undefined) await validarArchivo(data.archivo_id,'DOCUMENTO',files);
    const anterior = row.archivo_id;
    await row.update(data,{transaction});
    const trabajos = data.archivo_id !== undefined && String(anterior) !== String(data.archivo_id)
      ? await encolarSinReferencias([anterior],actor.id,transaction,files) : [];
    await row.reload({transaction});
    return {entidadId:row.id,data:row,trabajos,detalle:{curso_id:String(row.curso_id),campos:Object.keys(data)}};
  },200,'Material actualizado correctamente.');
});
export const ER_CursoMaterial_CTS = controlador(async (req,actor) => {
  camposPermitidos(req.body,[],{vacio:true});
  return conContenido(req,actor,'MATERIAL_ELIMINADO','curso_materiales',async transaction => {
    const row = await obtener(req,transaction), materialId = String(row.id);
    const files = await bloquearArchivos([row.archivo_id],transaction);
    await row.destroy({transaction});
    const trabajos = await encolarSinReferencias([row.archivo_id],actor.id,transaction,files);
    return {entidadId:materialId,data:{id:materialId},trabajos,detalle:{curso_id:String(row.curso_id),archivo_id:String(row.archivo_id)}};
  },200,'Material eliminado del curso.');
});
