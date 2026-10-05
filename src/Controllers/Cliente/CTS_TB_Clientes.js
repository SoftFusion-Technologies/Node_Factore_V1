/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Gestión de fichas comerciales independientes de las cuentas.
 * Tema: Controladores - Cliente
 * Capa: Backend
 */
import { Op } from 'sequelize';
import ClientesModel from '../../Models/Cliente/MD_TB_Clientes.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import { controlador } from '../../utils/http.utils.js';
import { camposPermitidos, texto, email, opcion, bandera, id, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { conAuditoria } from '../../Services/Sistema/auditoria.service.js';
import { normalizarEstadoCliente, revocarAccesoCliente } from '../../Services/Cliente/clienteEstado.service.js';

const campos = ['tipo','nombre','razon_social','documento','email','telefono','rubro','ciudad','estado_comercial','activo'];
const tipos = ['PERSONA','EMPRESA'];
const estados = ['PROSPECTO','CLIENTE','INACTIVO'];
const cuenta = { model: UsuariosModel, as: 'usuario', attributes: ['id','nombre','email','rol','estado'], required: false };

function validar(body, crear = false) {
  const input = camposPermitidos(body, campos);
  if (crear) exigir(input.nombre !== undefined, 422, 'DATOS_INVALIDOS', 'nombre es obligatorio.');
  const data = {};
  const texts = { nombre:180, razon_social:180, documento:30, telefono:40, rubro:120, ciudad:120 };
  for (const [name, value] of Object.entries(input)) {
    if (texts[name]) data[name] = texto(value, name, texts[name], { nullable: name !== 'nombre' });
    else if (name === 'email') data[name] = email(value, name);
    else if (name === 'tipo') data[name] = opcion(value, name, tipos);
    else if (name === 'estado_comercial') data[name] = opcion(value, name, estados);
    else if (name === 'activo') data[name] = bandera(value, name);
  }
  return data;
}

export const OBRS_Clientes_CTS = controlador(async req => {
  const query = consulta(req.query, ['tipo','estado_comercial','activo']);
  const where = {};
  if (query.tipo !== undefined) where.tipo = opcion(query.tipo, 'tipo', tipos);
  if (query.estado_comercial !== undefined) where.estado_comercial = opcion(query.estado_comercial, 'estado_comercial', estados);
  if (query.activo !== undefined) where.activo = bandera(query.activo, 'activo', true);
  const q = busqueda(query.q);
  if (q) where[Op.or] = ['nombre','razon_social','documento','email','telefono'].map(column => ({ [column]: { [Op.like]: `%${q}%` } }));
  return listar(ClientesModel, query, { where, include:[cuenta] }, ['id','nombre','creado_en','actualizado_en'], 'nombre');
});

export const OBRS_DetCliente_CTS = controlador(async req => {
  const row = await ClientesModel.findByPk(id(req.params?.id), { include:[cuenta] });
  exigir(row, 404, 'NO_ENCONTRADO', 'Cliente no encontrado.');
  return { data: row };
});

export const CR_Cliente_CTS = controlador(async (req, actor) => {
  const data = normalizarEstadoCliente(validar(req.body, true));
  const cliente = await conAuditoria(req, actor, 'CLIENTE_CREADO', 'crm_clientes', async transaction => {
    const row = await ClientesModel.create(data, { transaction });
    await row.reload({ transaction });
    return { entidadId:row.id, data:row, detalle:{ campos:Object.keys(data) } };
  });
  return { status:201, message:'Cliente creado correctamente.', data:cliente };
});

async function actualizar(req, actor, desactivar) {
  const clienteId = id(req.params?.id);
  if (desactivar) camposPermitidos(req.body, [], { vacio:true });
  const data = desactivar ? { activo:0, estado_comercial:'INACTIVO' } : validar(req.body);
  const cliente = await conAuditoria(req, actor, desactivar ? 'CLIENTE_DESACTIVADO' : 'CLIENTE_ACTUALIZADO', 'crm_clientes', async transaction => {
    const row = await ClientesModel.findByPk(clienteId, { transaction, lock:transaction.LOCK.UPDATE });
    exigir(row, 404, 'NO_ENCONTRADO', 'Cliente no encontrado.');
    normalizarEstadoCliente(data, row);
    await row.update(data, { transaction });
    const revocaciones = data.activo === 0 ? await revocarAccesoCliente(clienteId, transaction) : {};
    await row.reload({ transaction });
    return { entidadId:row.id, data:row, detalle:{ campos:Object.keys(data), ...revocaciones } };
  });
  return { message:desactivar ? 'Cliente desactivado correctamente.' : 'Cliente actualizado correctamente.', data:cliente };
}
export const UR_Cliente_CTS = controlador((req, actor) => actualizar(req, actor, false));
export const ER_Cliente_CTS = controlador((req, actor) => actualizar(req, actor, true));
