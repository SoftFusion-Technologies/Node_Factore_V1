/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Clientes/contactos vinculados a comercios, tengan o no cuenta.
 * Tema: Controladores - Comercio
 * Capa: Backend
 */
import ComercioClientesModel from '../../Models/Comercio/MD_TB_ComercioClientes.js';
import ComerciosAmigosModel from '../../Models/Comercio/MD_TB_ComerciosAmigos.js';
import ClientesModel from '../../Models/Cliente/MD_TB_Clientes.js';
import { controlador } from '../../utils/http.utils.js';
import { id, texto, camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { conAuditoria } from '../../Services/Sistema/auditoria.service.js';
import { Op } from 'sequelize';

const datosCliente = ['id','tipo','nombre','razon_social','email','telefono','estado_comercial','activo'];
const datosComercio = ['id','nombre','slug','rubro','ciudad','activo','mostrar_a_usuarios'];
async function comercio(req, transaction) {
  const comercioId = id(req.params?.comercio_id, 'comercio_id');
  const row = await ComerciosAmigosModel.findByPk(comercioId, { attributes:['id','activo'],
    ...(transaction ? { transaction, lock:transaction.LOCK.UPDATE } : {}) });
  exigir(row, 404, 'NO_ENCONTRADO', 'Comercio no encontrado.');
  return row;
}

export const OBRS_ClientesComercio_CTS = controlador(async req => {
  const parent = await comercio(req);
  const query = consulta(req.query);
  const q = busqueda(query.q);
  return listar(ComercioClientesModel, query, { where:{ comercio_id:parent.id },
    include:[{ model:ClientesModel, as:'cliente', attributes:datosCliente,
      ...(q ? { where:{ nombre:{ [Op.like]:`%${q}%` } } } : {}) }] }, ['id','creado_en'], 'id');
});

export const OBRS_ComerciosCliente_CTS = controlador(async req => {
  const clienteId = id(req.params?.cliente_id, 'cliente_id');
  exigir(await ClientesModel.findByPk(clienteId, { attributes:['id'] }), 404, 'NO_ENCONTRADO', 'Cliente no encontrado.');
  const query = consulta(req.query);
  const q = busqueda(query.q);
  return listar(ComercioClientesModel, query, { where:{ cliente_id:clienteId },
    include:[{ model:ComerciosAmigosModel, as:'comercio', attributes:datosComercio,
      ...(q ? { where:{ nombre:{ [Op.like]:`%${q}%` } } } : {}) }] }, ['id','creado_en'], 'id');
});

export const CR_ComercioCliente_CTS = controlador(async (req, actor) => {
  const input = camposPermitidos(req.body, ['cliente_id','funcion']);
  const clienteId = id(input.cliente_id, 'cliente_id');
  const funcion = input.funcion === undefined ? null : texto(input.funcion, 'funcion', 120, { nullable:true });
  const vinculo = await conAuditoria(req, actor, 'COMERCIO_CLIENTE_VINCULADO', 'comercio_clientes', async transaction => {
    const parent = await comercio(req, transaction);
    const client = await ClientesModel.findByPk(clienteId, { attributes:['id','activo'], transaction, lock:transaction.LOCK.UPDATE });
    exigir(client, 404, 'NO_ENCONTRADO', 'Cliente no encontrado.');
    exigir(parent.activo === 1 && client.activo === 1, 409, 'REGISTRO_INACTIVO', 'Activar el comercio y el cliente antes de vincularlos.');
    const row = await ComercioClientesModel.create({ comercio_id:parent.id, cliente_id:clienteId, funcion }, { transaction });
    await row.reload({ transaction, include:[{ model:ClientesModel, as:'cliente', attributes:datosCliente }] });
    return { entidadId:row.id, data:row, detalle:{ comercio_id:String(parent.id), cliente_id:clienteId } };
  });
  return { status:201, message:'Cliente vinculado correctamente.', data:vinculo };
});

async function modificar(req, actor, eliminar) {
  const vinculoId = id(req.params?.id);
  const body = camposPermitidos(req.body, eliminar ? [] : ['funcion'], { vacio:eliminar });
  const funcion = eliminar ? undefined : texto(body.funcion, 'funcion', 120, { nullable:true });
  const data = await conAuditoria(req, actor, eliminar ? 'COMERCIO_CLIENTE_DESVINCULADO' : 'COMERCIO_CLIENTE_ACTUALIZADO', 'comercio_clientes', async transaction => {
    const parent = await comercio(req, transaction);
    const row = await ComercioClientesModel.findOne({ where:{ id:vinculoId, comercio_id:parent.id }, transaction, lock:transaction.LOCK.UPDATE });
    exigir(row, 404, 'NO_ENCONTRADO', 'Vínculo no encontrado para este comercio.');
    const detail = { comercio_id:String(parent.id), cliente_id:String(row.cliente_id) };
    if (eliminar) {
      await row.destroy({ transaction });
      return { entidadId:vinculoId, data:{ id:vinculoId, ...detail }, detalle:detail };
    }
    await row.update({ funcion }, { transaction });
    await row.reload({ transaction, include:[{ model:ClientesModel, as:'cliente', attributes:datosCliente }] });
    return { entidadId:row.id, data:row, detalle:detail };
  });
  return { message:eliminar ? 'Cliente desvinculado correctamente.' : 'Vínculo actualizado correctamente.', data };
}
export const UR_ComercioCliente_CTS = controlador((req, actor) => modificar(req, actor, false));
export const ER_ComercioCliente_CTS = controlador((req, actor) => modificar(req, actor, true));
