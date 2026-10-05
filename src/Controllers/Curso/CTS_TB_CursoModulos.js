/* Benjamin Orellana - 04/10/2026 - Módulos de cursos de Factor E. */
import { Op } from 'sequelize';
import ModulosModel from '../../Models/Curso/MD_TB_CursoModulos.js';
import { controlador } from '../../utils/http.utils.js';
import { id, texto, opcion, entero, camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { curso, conContenido } from '../../Services/Curso/contenido.service.js';
const estados = ['ACTIVO','ARCHIVADO'];
function validar(body,crear = false) {
  const input = camposPermitidos(body,['titulo','descripcion','estado','orden']), data = {};
  if (crear) exigir(input.titulo !== undefined,422,'DATOS_INVALIDOS','titulo es obligatorio.');
  for (const [name,value] of Object.entries(input)) {
    if (name === 'titulo' || name === 'descripcion') data[name] = texto(value,name,name === 'titulo' ? 180 : 50000,{nullable:name === 'descripcion',byteMax:name === 'descripcion' ? 60000 : undefined});
    else if (name === 'estado') data[name] = opcion(value,name,estados);
    else data.orden = entero(value,name);
  }
  return data;
}
async function obtener(req,transaction) {
  const parent = await curso(req,transaction);
  const row = await ModulosModel.findOne({where:{id:id(req.params?.id),curso_id:parent.id},...(transaction ? {transaction,lock:transaction.LOCK.UPDATE} : {})});
  exigir(row,404,'NO_ENCONTRADO','Módulo no encontrado en este curso.');
  return row;
}
export const OBRS_CursoModulos_CTS = controlador(async req => {
  const parent = await curso(req), query = consulta(req.query,['estado']), where = {curso_id:parent.id};
  if (query.estado !== undefined) where.estado = opcion(query.estado,'estado',estados);
  const q = busqueda(query.q);
  if (q) where.titulo = {[Op.like]:`%${q}%`};
  return listar(ModulosModel,query,{where},['id','titulo','orden','creado_en','actualizado_en'],'orden');
});
export const OBRS_DetCursoModulo_CTS = controlador(async req => ({data:await obtener(req)}));
export const CR_CursoModulo_CTS = controlador(async (req,actor) => {
  const data = validar(req.body,true);
  return conContenido(req,actor,'MODULO_CREADO','curso_modulos',async transaction => {
    const parent = await curso(req,transaction,true);
    const row = await ModulosModel.create({...data,curso_id:parent.id},{transaction});
    await row.reload({transaction});
    return {entidadId:row.id,data:row,detalle:{curso_id:String(parent.id),campos:Object.keys(data)}};
  },201,'Módulo creado correctamente.');
});
async function actualizar(req,actor,archivar) {
  if (archivar) camposPermitidos(req.body,[],{vacio:true});
  const data = archivar ? {estado:'ARCHIVADO'} : validar(req.body);
  return conContenido(req,actor,archivar ? 'MODULO_ARCHIVADO' : 'MODULO_ACTUALIZADO','curso_modulos',async transaction => {
    const row = await obtener(req,transaction);
    await row.update(data,{transaction});
    await row.reload({transaction});
    return {entidadId:row.id,data:row,detalle:{curso_id:String(row.curso_id),campos:Object.keys(data)}};
  },200,archivar ? 'Módulo archivado correctamente.' : 'Módulo actualizado correctamente.');
}
export const UR_CursoModulo_CTS = controlador((req,actor) => actualizar(req,actor,false));
export const ER_CursoModulo_CTS = controlador((req,actor) => actualizar(req,actor,true));
