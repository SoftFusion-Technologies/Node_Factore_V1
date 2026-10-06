/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Gestión administrativa de comercios amigos y su visibilidad.
 * Tema: Controladores - Comercio
 * Capa: Backend
 */
import { Op } from 'sequelize';
import ComerciosAmigosModel from '../../Models/Comercio/MD_TB_ComerciosAmigos.js';
import ArchivosModel from '../../Models/Archivo/MD_TB_Archivos.js';
import { controlador } from '../../utils/http.utils.js';
import { id, texto, email, url, bandera, entero, slug, slugDesdeNombre, camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { conContenido } from '../../Services/Curso/contenido.service.js';
import { bloquearArchivos, validarArchivo, encolarSinReferencias } from '../../Services/Archivo/archivoReferencias.service.js';
import { conAuditoria } from '../../Services/Sistema/auditoria.service.js';

const campos = ['nombre','slug','rubro','descripcion','ciudad','direccion_publica','telefono_publico','email_publico',
  'web_url','instagram_url','observaciones_internas','mostrar_a_usuarios','activo','orden'];
const logo = { model:ArchivosModel, as:'logo', attributes:['id','uuid','nombre_original','tipo','estado'], required:false };
function validar(body, crear = false) {
  const input = camposPermitidos(body, campos);
  if (crear) exigir(input.nombre !== undefined, 422, 'DATOS_INVALIDOS', 'nombre es obligatorio.');
  const data = {};
  const texts = { nombre:180, rubro:120, ciudad:120, direccion_publica:255, telefono_publico:40, descripcion:50000, observaciones_internas:50000 };
  for (const [name, value] of Object.entries(input)) {
    if (texts[name]) data[name] = texto(value, name, texts[name], { nullable:name !== 'nombre', ...(texts[name] === 50000 ? { byteMax:60000 } : {}) });
    else if (name === 'slug') data.slug = slug(value);
    else if (name === 'email_publico') data[name] = email(value, name);
    else if (['web_url','instagram_url'].includes(name)) data[name] = url(value, name);
    else if (['mostrar_a_usuarios','activo'].includes(name)) data[name] = bandera(value, name);
    else if (name === 'orden') data.orden = entero(value, name);
  }
  if (crear && data.slug === undefined) data.slug = slugDesdeNombre(data.nombre);
  return data;
}

export const OBRS_ComerciosAmigos_CTS = controlador(async req => {
  const query = consulta(req.query, ['activo','mostrar_a_usuarios','rubro','ciudad']);
  const where = {};
  for (const field of ['activo','mostrar_a_usuarios']) if (query[field] !== undefined) where[field] = bandera(query[field], field, true);
  for (const field of ['rubro','ciudad']) if (query[field] !== undefined) where[field] = texto(query[field], field, 120);
  const q = busqueda(query.q);
  if (q) where[Op.or] = ['nombre','rubro','ciudad'].map(column => ({ [column]:{ [Op.like]:`%${q}%` } }));
  return listar(ComerciosAmigosModel, query, { where, include:[logo] }, ['id','nombre','orden','creado_en','actualizado_en'], 'orden');
});

export const OBRS_DetComercioAmigo_CTS = controlador(async req => {
  const row = await ComerciosAmigosModel.findByPk(id(req.params?.id), { include:[logo] });
  exigir(row, 404, 'NO_ENCONTRADO', 'Comercio no encontrado.');
  return { data:row };
});

export const CR_ComercioAmigo_CTS = controlador(async (req, actor) => {
  const data = validar(req.body, true);
  const comercio = await conAuditoria(req, actor, 'COMERCIO_CREADO', 'comercios_amigos', async transaction => {
    const row = await ComerciosAmigosModel.create(data, { transaction });
    await row.reload({ transaction });
    return { entidadId:row.id, data:row, detalle:{ campos:Object.keys(data) } };
  });
  return { status:201, message:'Comercio creado correctamente.', data:comercio };
});

async function actualizar(req, actor, desactivar) {
  const comercioId = id(req.params?.id);
  if (desactivar) camposPermitidos(req.body, [], { vacio:true });
  const data = desactivar ? { activo:0 } : validar(req.body);
  const comercio = await conAuditoria(req, actor, desactivar ? 'COMERCIO_DESACTIVADO' : 'COMERCIO_ACTUALIZADO', 'comercios_amigos', async transaction => {
    const row = await ComerciosAmigosModel.findByPk(comercioId, { transaction, lock:transaction.LOCK.UPDATE });
    exigir(row, 404, 'NO_ENCONTRADO', 'Comercio no encontrado.');
    await row.update(data, { transaction });
    await row.reload({ transaction });
    return { entidadId:row.id, data:row, detalle:{ campos:Object.keys(data) } };
  });
  return { message:desactivar ? 'Comercio desactivado correctamente.' : 'Comercio actualizado correctamente.', data:comercio };
}
export const UR_ComercioAmigo_CTS = controlador((req, actor) => actualizar(req, actor, false));
export const ER_ComercioAmigo_CTS = controlador((req, actor) => actualizar(req, actor, true));

// El logo se gestiona por una operación específica, separada de la ficha comercial.
export const UR_LogoComercioAmigo_CTS = controlador(async (req, actor) => {
  const comercioId = id(req.params?.id), input = camposPermitidos(req.body, ['logo_archivo_id']);
  exigir(Object.hasOwn(input, 'logo_archivo_id'), 422, 'DATOS_INVALIDOS', 'Indicar el logo o null para retirarlo.');
  const logoId = input.logo_archivo_id === null ? null : id(input.logo_archivo_id, 'logo_archivo_id');
  return conContenido(req, actor, 'COMERCIO_LOGO_ACTUALIZADO', 'comercios_amigos', async transaction => {
    const row = await ComerciosAmigosModel.findByPk(comercioId, { transaction, lock:transaction.LOCK.UPDATE });
    exigir(row, 404, 'NO_ENCONTRADO', 'Comercio no encontrado.');
    const anterior = row.logo_archivo_id;
    const files = await bloquearArchivos([anterior, logoId], transaction);
    await validarArchivo(logoId, 'IMAGEN', files);
    await row.update({ logo_archivo_id:logoId }, { transaction });
    const trabajos = String(anterior) !== String(logoId)
      ? await encolarSinReferencias([anterior], actor.id, transaction, files) : [];
    await row.reload({ transaction });
    return { entidadId:row.id, data:row, trabajos, detalle:{ campos:['logo_archivo_id'] } };
  }, 200, logoId === null ? 'Logo retirado correctamente.' : 'Logo actualizado correctamente.');
});
