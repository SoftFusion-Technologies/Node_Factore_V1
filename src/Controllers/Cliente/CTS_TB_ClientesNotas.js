/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Notas privadas de seguimiento CRM, disponibles solo para ADMIN.
 * Tema: Controladores - Cliente
 * Capa: Backend
 */
import { Op } from 'sequelize';
import ClientesModel from '../../Models/Cliente/MD_TB_Clientes.js';
import ClientesNotasModel from '../../Models/Cliente/MD_TB_ClientesNotas.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import { controlador } from '../../utils/http.utils.js';
import { id, texto, camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { conAuditoria } from '../../Services/Sistema/auditoria.service.js';

const autor = { model:UsuariosModel, as:'autor', attributes:['id','nombre'], required:false };
async function cliente(req, transaction) {
  const clienteId = id(req.params?.cliente_id, 'cliente_id');
  const row = await ClientesModel.findByPk(clienteId, { attributes:['id'],
    ...(transaction ? { transaction, lock:transaction.LOCK.UPDATE } : {}) });
  exigir(row, 404, 'NO_ENCONTRADO', 'Cliente no encontrado.');
  return clienteId;
}
function contenido(body) {
  const value = camposPermitidos(body, ['contenido']);
  exigir(value.contenido !== undefined, 422, 'DATOS_INVALIDOS', 'contenido es obligatorio.');
  return texto(value.contenido, 'contenido', 50000, { byteMax:60000 });
}

export const OBRS_ClientesNotas_CTS = controlador(async req => {
  const clienteId = await cliente(req);
  const query = consulta(req.query);
  const where = { cliente_id:clienteId };
  const q = busqueda(query.q);
  if (q) where.contenido = { [Op.like]:`%${q}%` };
  return listar(ClientesNotasModel, query, { where, include:[autor] }, ['id','creado_en','actualizado_en'], 'creado_en');
});

export const OBRS_DetClienteNota_CTS = controlador(async req => {
  const clienteId = await cliente(req);
  const row = await ClientesNotasModel.findOne({ where:{ id:id(req.params?.id), cliente_id:clienteId }, include:[autor] });
  exigir(row, 404, 'NO_ENCONTRADO', 'Nota no encontrada para este cliente.');
  return { data:row };
});

export const CR_ClienteNota_CTS = controlador(async (req, actor) => {
  const noteText = contenido(req.body);
  const nota = await conAuditoria(req, actor, 'CLIENTE_NOTA_CREADA', 'clientes_notas', async transaction => {
    const clienteId = await cliente(req, transaction);
    const row = await ClientesNotasModel.create({ cliente_id:clienteId, contenido:noteText, creado_por:actor.id }, { transaction });
    await row.reload({ transaction, include:[autor] });
    return { entidadId:row.id, data:row, detalle:{ cliente_id:clienteId } };
  });
  return { status:201, message:'Nota creada correctamente.', data:nota };
});

export const UR_ClienteNota_CTS = controlador(async (req, actor) => {
  const notaId = id(req.params?.id);
  const noteText = contenido(req.body);
  const nota = await conAuditoria(req, actor, 'CLIENTE_NOTA_ACTUALIZADA', 'clientes_notas', async transaction => {
    const clienteId = await cliente(req, transaction);
    const row = await ClientesNotasModel.findOne({ where:{ id:notaId, cliente_id:clienteId }, transaction, lock:transaction.LOCK.UPDATE });
    exigir(row, 404, 'NO_ENCONTRADO', 'Nota no encontrada para este cliente.');
    await row.update({ contenido:noteText }, { transaction });
    await row.reload({ transaction, include:[autor] });
    return { entidadId:row.id, data:row, detalle:{ cliente_id:clienteId } };
  });
  return { message:'Nota actualizada correctamente.', data:nota };
});

export const ER_ClienteNota_CTS = controlador(async (req, actor) => {
  const notaId = id(req.params?.id);
  camposPermitidos(req.body, [], { vacio:true });
  const data = await conAuditoria(req, actor, 'CLIENTE_NOTA_ELIMINADA', 'clientes_notas', async transaction => {
    const clienteId = await cliente(req, transaction);
    const row = await ClientesNotasModel.findOne({ where:{ id:notaId, cliente_id:clienteId }, transaction, lock:transaction.LOCK.UPDATE });
    exigir(row, 404, 'NO_ENCONTRADO', 'Nota no encontrada para este cliente.');
    await row.destroy({ transaction });
    return { entidadId:notaId, data:{ id:notaId, cliente_id:clienteId }, detalle:{ cliente_id:clienteId } };
  });
  return { message:'Nota eliminada correctamente.', data };
});
