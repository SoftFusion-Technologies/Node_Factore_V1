/* Benjamin Orellana - 04/10/2026 - Estado comercial y revocación de sesiones del alumno. */
import { Op, literal } from 'sequelize';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import UsuariosSesionesModel from '../../Models/Usuario/MD_TB_UsuariosSesiones.js';
import UsuariosTokensModel from '../../Models/Usuario/MD_TB_UsuariosTokens.js';
import { exigir } from '../../utils/validacion.utils.js';

export function normalizarEstadoCliente(data, current) {
  exigir(!(data.estado_comercial === 'INACTIVO' && data.activo === 1), 422, 'ESTADO_INVALIDO', 'Un cliente INACTIVO no puede tener activo=1.');
  exigir(!(data.activo === 0 && data.estado_comercial !== undefined && data.estado_comercial !== 'INACTIVO'),
    422, 'ESTADO_INVALIDO', 'Al desactivar el cliente, su estado comercial debe ser INACTIVO.');
  if (data.estado_comercial === 'INACTIVO') data.activo = 0;
  if (data.activo === 0) data.estado_comercial = 'INACTIVO';
  if (data.estado_comercial !== undefined && data.estado_comercial !== 'INACTIVO' && data.activo === undefined && current?.activo === 0) data.activo = 1;
  if (data.activo === 1 && data.estado_comercial === undefined && current?.estado_comercial === 'INACTIVO') data.estado_comercial = 'CLIENTE';
  return data;
}
export async function revocarAccesoCliente(clienteId, transaction) {
  const users = await UsuariosModel.findAll({ where: { cliente_id: clienteId, rol: 'ALUMNO' },
    attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
  if (!users.length) return { sesiones_revocadas: 0, tokens_revocados: 0 };
  const where = { usuario_id: { [Op.in]: users.map(u => u.id) }, revocada_en: null };
  const [sessions] = await UsuariosSesionesModel.update({ revocada_en: literal('UTC_TIMESTAMP(3)') }, { where, transaction });
  const [tokens] = await UsuariosTokensModel.update({ revocado_en: literal('UTC_TIMESTAMP(3)') }, {
    where: { usuario_id: where.usuario_id, revocado_en: null }, transaction });
  return { sesiones_revocadas: sessions, tokens_revocados: tokens };
}
