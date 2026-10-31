/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
import { cargaHorariaCertificado, validarConfiguracionCertificado } from '../../Services/Certificado/configuracionCertificado.service.js';
/* Benjamin Orellana - 04/10/2026 - Gestión administrativa de cursos de Factor E. */
import { Op } from 'sequelize';
import CursosModel from '../../Models/Curso/MD_TB_Cursos.js';
import LeccionesModel from '../../Models/Curso/MD_TB_CursoLecciones.js';
import ModulosModel from '../../Models/Curso/MD_TB_CursoModulos.js';
import ArchivosModel from '../../Models/Archivo/MD_TB_Archivos.js';
import { controlador } from '../../utils/http.utils.js';
import { id, texto, opcion, bandera, entero, slug, slugDesdeNombre, camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { precio, conContenido } from '../../Services/Curso/contenido.service.js';
import { atributosArchivo, bloquearArchivos, validarArchivo, encolarSinReferencias } from '../../Services/Archivo/archivoReferencias.service.js';

const campos = ['titulo','slug','descripcion_corta','descripcion','portada_archivo_id','precio','moneda','modalidad','estado','visible_catalogo','orden','venta_online_habilitada','acceso_duracion_cantidad','acceso_duracion_unidad','certificado_carga_horaria','certificado_habilitado'];
const estados = ['BORRADOR','PUBLICADO','ARCHIVADO'];
const modalidades = ['VIRTUAL','PRESENCIAL','MIXTA'];
const portada = {model:ArchivosModel,as:'portada',attributes:atributosArchivo,required:false};
function validar(body, crear = false) {
  const input = camposPermitidos(body, campos), data = {};
  if (crear) exigir(input.titulo !== undefined,422,'DATOS_INVALIDOS','titulo es obligatorio.');
  for (const [name,value] of Object.entries(input)) {
    if (['titulo','descripcion_corta','descripcion'].includes(name)) data[name] = texto(value,name,name === 'titulo' ? 180 : name === 'descripcion_corta' ? 500 : 50000,{nullable:name !== 'titulo'});
    else if (name === 'slug') data.slug = slug(value);
    else if (name === 'portada_archivo_id') data[name] = value === null ? null : id(value,name);
    else if (name === 'certificado_carga_horaria') data[name] = cargaHorariaCertificado(value);
    else if (name === 'precio') data.precio = precio(value);
    else if (name === 'moneda') {
      data.moneda = texto(value,name,3).toUpperCase();
      exigir(/^[A-Z]{3}$/.test(data.moneda),422,'DATOS_INVALIDOS','moneda debe tener tres letras.');
    } else if (name === 'modalidad') data[name] = opcion(value,name,modalidades);
    else if (name === 'estado') data[name] = opcion(value,name,estados);
    else if (name === 'acceso_duracion_unidad') data[name] = opcion(value,name,['DIAS','MESES']);
    else if (name === 'acceso_duracion_cantidad') data[name] = entero(value,name);
    else if (['visible_catalogo','venta_online_habilitada','certificado_habilitado'].includes(name)) data[name] = bandera(value,name);
    else data.orden = entero(value,name);
  }
  if (crear && data.slug === undefined) data.slug = slugDesdeNombre(data.titulo);
  return data;
}
function validarPolitica(data, row = {}) {
  validarConfiguracionCertificado(data, row);
  const cantidad = data.acceso_duracion_cantidad ?? row.acceso_duracion_cantidad ?? 1;
  const unidad = data.acceso_duracion_unidad ?? row.acceso_duracion_unidad ?? 'MESES';
  exigir(cantidad >= 1 && cantidad <= (unidad === 'MESES' ? 120 : 3650),422,'DATOS_INVALIDOS','Duración: de 1 a 120 meses o de 1 a 3650 días.');
  const enabled = data.venta_online_habilitada ?? row.venta_online_habilitada ?? 0;
  if (enabled) {
    const importe = data.precio !== undefined ? data.precio : row.precio;
    const positivo = typeof importe === 'string' && /^\d+(?:\.\d{1,2})?$/.test(importe) && BigInt(importe.replace('.','')) > 0n;
    exigir((data.estado ?? row.estado) === 'PUBLICADO' && (data.visible_catalogo ?? row.visible_catalogo) === 1 &&
      (data.moneda ?? row.moneda ?? 'ARS') === 'ARS' && positivo,
      422,'VENTA_ONLINE_NO_DISPONIBLE','Para habilitar la venta online, publicá el contenido, mostrá el curso en la web y definí un precio positivo en ARS.');
  }
}
async function validarPublicacion(cursoId, transaction,portadas) {
  const lecciones = await LeccionesModel.findAll({where:{curso_id:cursoId,estado:'PUBLICADA'},
    include:[{model:ModulosModel,as:'modulo',where:{estado:'ACTIVO'},attributes:['id'],required:true}],transaction});
  const files = await bloquearArchivos([...portadas,...lecciones.map(row => row.video_archivo_id)],transaction);
  for (const row of lecciones) {
    if (!row.video_archivo_id) continue;
    try { await validarArchivo(row.video_archivo_id,'VIDEO',files); return files; }
    catch (error) { if (!['ARCHIVO_INVALIDO','ARCHIVO_NO_DISPONIBLE'].includes(error.code)) throw error; }
  }
  exigir(false,422,'CURSO_SIN_CONTENIDO','Publicar al menos una lección con video disponible dentro de un módulo activo.');
}
export const OBRS_Cursos_CTS = controlador(async req => {
  const query = consulta(req.query,['estado','visible_catalogo','modalidad']), where = {};
  if (query.estado !== undefined) where.estado = opcion(query.estado,'estado',estados);
  if (query.modalidad !== undefined) where.modalidad = opcion(query.modalidad,'modalidad',modalidades);
  if (query.visible_catalogo !== undefined) where.visible_catalogo = bandera(query.visible_catalogo,'visible_catalogo',true);
  const q = busqueda(query.q);
  if (q) where[Op.or] = ['titulo','descripcion_corta'].map(column => ({[column]:{[Op.like]:`%${q}%`}}));
  return listar(CursosModel,query,{where,include:[portada]},['id','titulo','orden','creado_en','actualizado_en'],'orden');
});
export const OBRS_DetCurso_CTS = controlador(async req => {
  const row = await CursosModel.findByPk(id(req.params?.id),{include:[portada]});
  exigir(row,404,'NO_ENCONTRADO','Curso no encontrado.');
  return {data:row};
});
export const CR_Curso_CTS = controlador(async (req,actor) => {
  const data = validar(req.body,true);
  validarPolitica({...data,estado:data.estado ?? 'BORRADOR'});
  exigir(data.estado !== 'PUBLICADO',422,'CURSO_SIN_CONTENIDO','Crear el curso en borrador y agregar su contenido antes de publicarlo.');
  return conContenido(req,actor,'CURSO_CREADO','cursos',async transaction => {
    const files = await bloquearArchivos([data.portada_archivo_id],transaction);
    await validarArchivo(data.portada_archivo_id,'IMAGEN',files);
    const row = await CursosModel.create({...data,creado_por:actor.id},{transaction});
    await row.reload({transaction});
    return {entidadId:row.id,data:row,detalle:{campos:Object.keys(data)}};
  },201,'Curso creado correctamente.');
});
async function actualizar(req,actor,archivar) {
  const cursoId = id(req.params?.id);
  if (archivar) camposPermitidos(req.body,[],{vacio:true});
  const data = archivar ? {estado:'ARCHIVADO'} : validar(req.body);
  return conContenido(req,actor,archivar ? 'CURSO_ARCHIVADO' : 'CURSO_ACTUALIZADO','cursos',async transaction => {
    const row = await CursosModel.findByPk(cursoId,{transaction,lock:transaction.LOCK.UPDATE});
    exigir(row,404,'NO_ENCONTRADO','Curso no encontrado.');
    if (data.estado === 'BORRADOR' || data.estado === 'ARCHIVADO' || data.visible_catalogo === 0) data.venta_online_habilitada = 0;
    validarPolitica(data,row);
    const habilitaVenta = data.venta_online_habilitada === 1 && row.venta_online_habilitada !== 1;
    const portadas = [row.portada_archivo_id,data.portada_archivo_id];
    const files = data.estado === 'PUBLICADO' || habilitaVenta ? await validarPublicacion(row.id,transaction,portadas)
      : await bloquearArchivos(portadas,transaction);
    if (data.portada_archivo_id !== undefined) await validarArchivo(data.portada_archivo_id,'IMAGEN',files);
    const anterior = row.portada_archivo_id;
    await row.update(data,{transaction});
    const trabajos = data.portada_archivo_id !== undefined && String(anterior) !== String(data.portada_archivo_id)
      ? await encolarSinReferencias([anterior],actor.id,transaction,files) : [];
    await row.reload({transaction});
    return {entidadId:row.id,data:row,trabajos,detalle:{campos:Object.keys(data)}};
  },200,archivar ? 'Curso archivado correctamente.' : 'Curso actualizado correctamente.');
}
export const UR_Curso_CTS = controlador((req,actor) => actualizar(req,actor,false));
export const ER_Curso_CTS = controlador((req,actor) => actualizar(req,actor,true));
