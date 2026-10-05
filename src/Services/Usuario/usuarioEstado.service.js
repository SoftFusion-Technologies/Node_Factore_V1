/* Benjamin Orellana - 05/10/2026 - Estado de cuentas y revocación de credenciales. */
import { literal } from 'sequelize';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import ClientesModel from '../../Models/Cliente/MD_TB_Clientes.js';
import SesionesModel from '../../Models/Usuario/MD_TB_UsuariosSesiones.js';
import TokensModel from '../../Models/Usuario/MD_TB_UsuariosTokens.js';
import { exigir,id } from '../../utils/validacion.utils.js';
export const atributosUsuario=['id','cliente_id','nombre','email','rol','estado','cambiar_password','ultimo_ingreso_en','creado_en','actualizado_en'];
export const publicoUsuario=row=>Object.fromEntries(atributosUsuario.map(key=>[key,row.get(key)]));
export async function bloquearUsuario(value,transaction) {
  const key=id(value),candidate=await UsuariosModel.findByPk(key,{attributes:['id','cliente_id'],transaction});
  exigir(candidate,404,'NO_ENCONTRADO','Usuario no encontrado.');
  const cliente=candidate.cliente_id?await ClientesModel.findByPk(candidate.cliente_id,{transaction,lock:transaction.LOCK.UPDATE}):null;
  const user=await UsuariosModel.scope('conHash').findByPk(key,{transaction,lock:transaction.LOCK.UPDATE});
  exigir(user&&String(user.cliente_id)===String(candidate.cliente_id),409,'CONCURRENCIA','La cuenta cambió. Reintentá.');
  return {user,cliente};
}
export function exigirCliente(user,cliente) {
  exigir(user.rol==='ADMIN'||(user.cliente_id&&cliente?.activo===1),409,'CLIENTE_INACTIVO','La ficha comercial del alumno no está activa.');
}
export async function revocarUsuario(value,transaction) {
  const where={usuario_id:value};
  const [sesiones]=await SesionesModel.update({revocada_en:literal('UTC_TIMESTAMP(3)')},{where:{...where,revocada_en:null},transaction});
  const [tokens]=await TokensModel.update({revocado_en:literal('UTC_TIMESTAMP(3)')},{where:{...where,revocado_en:null,usado_en:null},transaction});
  return {sesiones_revocadas:sesiones,tokens_revocados:tokens};
}
export async function conservarAdministrador(transaction) {
  const admins=await UsuariosModel.findAll({where:{rol:'ADMIN'},attributes:['id','estado'],order:[['id','ASC']],transaction,lock:transaction.LOCK.UPDATE});
  exigir(admins.filter(row=>row.estado==='ACTIVO').length>1,409,'ULTIMO_ADMIN','No se puede desactivar el último administrador activo.');
}
