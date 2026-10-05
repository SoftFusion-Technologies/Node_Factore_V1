/* Benjamin Orellana - 05/10/2026 - Sesiones opacas y activación manual de cuentas. */
import { Op,literal,Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import ClientesModel from '../../Models/Cliente/MD_TB_Clientes.js';
import SesionesModel from '../../Models/Usuario/MD_TB_UsuariosSesiones.js';
import TokensModel from '../../Models/Usuario/MD_TB_UsuariosTokens.js';
import AuditoriaModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { camposPermitidos,email,exigir } from '../../utils/validacion.utils.js';
import { hashPassword,verificarPassword,igualSeguro,tokenAleatorio,hashToken,tokenCsrf,tokenValido } from '../../utils/password.utils.js';
import { configAuth,leerCookie,verificarOrigen,exigirJson } from './configAuth.service.js';
import { atributosUsuario,publicoUsuario,bloquearUsuario,exigirCliente,revocarUsuario } from './usuarioEstado.service.js';
const txOptions={isolationLevel:Transaction.ISOLATION_LEVELS.READ_COMMITTED};
const buckets=new Map();
function intentar(req) {
  const now=Date.now(),ip=String(req.ip||req.socket?.remoteAddress||'sin-ip');
  for(const [key,bucket] of buckets) if(bucket.until<=now) buckets.delete(key);
  for(const [key,max] of [[`ip:${ip}`,30]]) {
    let bucket=buckets.get(key);
    if(!bucket){exigir(buckets.size<10000,429,'INTENTOS_EXCEDIDOS','Reintentá más tarde.');bucket={count:0,until:now+15*60000};buckets.set(key,bucket);}
    bucket.count++;exigir(bucket.count<=max,429,'INTENTOS_EXCEDIDOS','Demasiados intentos. Reintentá en 15 minutos.');
  }
}
async function auditar(user,accion,transaction,detalle=null) {
  await AuditoriaModel.create({usuario_id:user.id,accion,entidad:'usuarios',entidad_id:user.id,detalle},{transaction});
}
export async function cargarSesion(raw) {
  if(!tokenValido(raw)) return null;
  const row=await SesionesModel.scope('conHash').findOne({where:{token_hash:hashToken(raw),revocada_en:null,vence_en:{[Op.gt]:literal('UTC_TIMESTAMP(3)')},
    [Op.or]:[{'$usuario.rol$':'ADMIN'},{'$usuario.cliente_id$':{[Op.ne]:null},'$usuario.cliente.activo$':1}]},
    attributes:['id','usuario_id','vence_en'],include:[{model:UsuariosModel,as:'usuario',required:true,where:{estado:'ACTIVO'},attributes:atributosUsuario,
      include:[{model:ClientesModel,as:'cliente',attributes:['id','activo'],required:false}]}]});
  return row?{id:String(row.id),vence_en:row.vence_en,usuario:publicoUsuario(row.usuario)}:null;
}
export async function sesionActual(req,{csrf=true}={}) {
  verificarOrigen(req);const raw=leerCookie(req),session=await cargarSesion(raw);
  exigir(session,401,'SESION_INVALIDA','Iniciar sesión para continuar.');
  if(csrf&&!['GET','HEAD','OPTIONS'].includes(req.method)) exigir(igualSeguro(req.headers?.['x-csrf-token'],tokenCsrf(raw)),403,'CSRF_INVALIDO','Actualizar la sesión e intentar nuevamente.');
  req.user=session.usuario;req.session=session;req.sessionToken=raw;return session;
}
export async function login(req) {
  verificarOrigen(req);exigirJson(req);intentar(req);
  const body=camposPermitidos(req.body,['email','password']);
  const mail=email(body.email,'email');exigir(mail,422,'DATOS_INVALIDOS','email es obligatorio.');
  exigir(typeof body.password==='string'&&body.password.length<=256&&!body.password.includes('\0'),422,'PASSWORD_INVALIDO','Contraseña inválida.');
  // El límite por IP se cuenta una sola vez; el de cuenta no permite reinicios por casing.
  const now=Date.now(),key='cuenta:'+hashToken(mail);let bucket=buckets.get(key);
  if(!bucket||bucket.until<=now){exigir(buckets.size<10000,429,'INTENTOS_EXCEDIDOS','Reintentá más tarde.');bucket={count:0,until:now+15*60000};buckets.set(key,bucket);}
  bucket.count++;exigir(bucket.count<=10,429,'INTENTOS_EXCEDIDOS','Demasiados intentos. Reintentá en 15 minutos.');
  const candidate=await UsuariosModel.scope('conHash').findOne({where:{email:mail}});
  const valid=await verificarPassword(body.password,candidate?.password_hash);
  exigir(valid&&candidate?.estado==='ACTIVO',401,'CREDENCIALES_INVALIDAS','Email o contraseña incorrectos, o cuenta no habilitada.');
  const raw=tokenAleatorio(),expires=new Date(Date.now()+configAuth().hours*3600000);
  const user=await db.transaction(txOptions,async transaction=>{
    const {user,cliente}=await bloquearUsuario(candidate.id,transaction);
    exigir(user.estado==='ACTIVO'&&user.email===mail&&igualSeguro(user.password_hash,candidate.password_hash),401,'CREDENCIALES_INVALIDAS','Email o contraseña incorrectos, o cuenta no habilitada.');
    exigir(user.rol==='ADMIN'||(user.cliente_id&&cliente?.activo===1),401,'CREDENCIALES_INVALIDAS','Email o contraseña incorrectos, o cuenta no habilitada.');
    await SesionesModel.create({usuario_id:user.id,token_hash:hashToken(raw),vence_en:expires,
      ip:String(req.ip||req.socket?.remoteAddress||'').slice(0,45)||null,user_agent:String(req.headers?.['user-agent']||'').slice(0,500)||null},{transaction});
    await user.update({ultimo_ingreso_en:literal('UTC_TIMESTAMP(3)')},{transaction});await user.reload({transaction});
    await auditar(user,'LOGIN',transaction);return publicoUsuario(user);
  });
  return {raw,data:{usuario:user,csrf_token:tokenCsrf(raw),vence_en:expires}};
}
export async function logout(req) {
  verificarOrigen(req);camposPermitidos(req.body,[],{vacio:true});const raw=leerCookie(req),session=await cargarSesion(raw);
  if(!session) return;
  exigir(igualSeguro(req.headers?.['x-csrf-token'],tokenCsrf(raw)),403,'CSRF_INVALIDO','Actualizar la sesión e intentar nuevamente.');
  await db.transaction(txOptions,async transaction=>{
    const {user}=await bloquearUsuario(session.usuario.id,transaction);
    const row=await SesionesModel.findByPk(session.id,{transaction,lock:transaction.LOCK.UPDATE});
    if(row&&!row.revocada_en){await row.update({revocada_en:literal('UTC_TIMESTAMP(3)')},{transaction});await auditar(user,'LOGOUT',transaction);}
  });
}
export async function cambiarPassword(req) {
  const session=await sesionActual(req);exigirJson(req);intentar(req);
  const body=camposPermitidos(req.body,['password_actual','password_nuevo']);
  const candidate=await UsuariosModel.scope('conHash').findByPk(session.usuario.id);
  exigir(await verificarPassword(body.password_actual,candidate?.password_hash),401,'CREDENCIALES_INVALIDAS','La contraseña actual no es correcta.');
  exigir(body.password_actual!==body.password_nuevo,422,'PASSWORD_REPETIDO','Elegir una contraseña distinta de la actual.');
  const hash=await hashPassword(body.password_nuevo);
  await db.transaction(txOptions,async transaction=>{
    const {user,cliente}=await bloquearUsuario(candidate.id,transaction);exigirCliente(user,cliente);
    const current=await SesionesModel.scope('conHash').findOne({where:{id:session.id,usuario_id:user.id,token_hash:hashToken(req.sessionToken),revocada_en:null,vence_en:{[Op.gt]:literal('UTC_TIMESTAMP(3)')}},transaction,lock:transaction.LOCK.UPDATE});
    exigir(current&&user.estado==='ACTIVO'&&igualSeguro(user.password_hash,candidate.password_hash),409,'SESION_CAMBIADA','La cuenta cambió. Iniciar sesión nuevamente.');
    await user.update({password_hash:hash,cambiar_password:0},{transaction});await revocarUsuario(user.id,transaction);await auditar(user,'PASSWORD_CAMBIADO',transaction);
  });
}
export async function emitirToken(user,transaction,tipo) {
  exigir(tipo==='ACTIVACION'?user.estado==='PENDIENTE':user.estado==='ACTIVO',409,'USUARIO_ESTADO','El estado de la cuenta no permite esta acción.');
  await revocarUsuario(user.id,transaction);
  const raw=tokenAleatorio(),expires=new Date(Date.now()+(tipo==='ACTIVACION'?48:1)*3600000);
  const row=await TokensModel.create({usuario_id:user.id,tipo,token_hash:hashToken(raw),vence_en:expires},{transaction});
  return {id:String(row.id),tipo,token:raw,vence_en:expires,enlace:`${configAuth().front}/${tipo==='ACTIVACION'?'activar-cuenta':'recuperar-cuenta'}?token=${raw}`};
}
export async function consumirToken(req,tipo) {
  verificarOrigen(req);exigirJson(req);intentar(req);
  const body=camposPermitidos(req.body,['token','password']);exigir(tokenValido(body.token),422,'TOKEN_INVALIDO','Token inválido.');
  const where={token_hash:hashToken(body.token),tipo,usado_en:null,revocado_en:null,vence_en:{[Op.gt]:literal('UTC_TIMESTAMP(3)')}};
  const candidate=await TokensModel.scope('conHash').findOne({where,attributes:['id','usuario_id']});
  exigir(candidate,400,'ENLACE_INVALIDO','El enlace no es válido, ya fue usado o venció.');
  const hash=await hashPassword(body.password);
  await db.transaction(txOptions,async transaction=>{
    const {user,cliente}=await bloquearUsuario(candidate.usuario_id,transaction);
    const token=await TokensModel.scope('conHash').findOne({where,transaction,lock:transaction.LOCK.UPDATE});
    exigir(token&&(tipo==='ACTIVACION'?user.estado==='PENDIENTE':user.estado==='ACTIVO'),400,'ENLACE_INVALIDO','El enlace no es válido, ya fue usado o venció.');
    exigirCliente(user,cliente);
    await user.update({password_hash:hash,estado:'ACTIVO',cambiar_password:0},{transaction});
    await token.update({usado_en:literal('UTC_TIMESTAMP(3)')},{transaction});await revocarUsuario(user.id,transaction);
    await auditar(user,tipo+'_COMPLETADA',transaction);
  });
}
