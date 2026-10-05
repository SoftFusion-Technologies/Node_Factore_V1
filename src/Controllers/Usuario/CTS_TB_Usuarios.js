/* Benjamin Orellana - 05/10/2026 - Gestión de cuentas y enlaces manuales. */
import { Op } from 'sequelize';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import ClientesModel from '../../Models/Cliente/MD_TB_Clientes.js';
import { controlador } from '../../utils/http.utils.js';
import { id,texto,email,opcion,bandera,camposPermitidos,exigir } from '../../utils/validacion.utils.js';
import { consulta,busqueda,listar } from '../../utils/listados.utils.js';
import { hashPassword,hashValido } from '../../utils/password.utils.js';
import { conAuditoria } from '../../Services/Sistema/auditoria.service.js';
import { atributosUsuario,publicoUsuario,bloquearUsuario,exigirCliente,revocarUsuario,conservarAdministrador } from '../../Services/Usuario/usuarioEstado.service.js';
import { emitirToken } from '../../Services/Usuario/auth.service.js';
const roles=['ADMIN','ALUMNO'],estados=['PENDIENTE','ACTIVO','BLOQUEADO','INACTIVO'];
const clienteInclude={model:ClientesModel,as:'cliente',attributes:['id','nombre','activo'],required:false};
function validar(body,crear=false) {
  const fields=crear?['nombre','email','rol','cliente_id','estado','password']:['nombre','email','estado','cambiar_password'];
  const input=camposPermitidos(body,fields),data={};
  if(crear) exigir(input.nombre!==undefined&&input.email!==undefined,422,'DATOS_INVALIDOS','nombre y email son obligatorios.');
  if(input.nombre!==undefined) data.nombre=texto(input.nombre,'nombre',180);
  if(input.email!==undefined){data.email=email(input.email,'email');exigir(data.email,422,'DATOS_INVALIDOS','email no puede quedar vacío.');}
  if(input.estado!==undefined) data.estado=opcion(input.estado,'estado',estados);
  if(input.cambiar_password!==undefined) data.cambiar_password=bandera(input.cambiar_password,'cambiar_password');
  if(crear){data.rol=opcion(input.rol??'ALUMNO','rol',roles);data.cliente_id=input.cliente_id===null||input.cliente_id===undefined?null:id(input.cliente_id,'cliente_id');}
  return {input,data};
}
export const OBRS_Usuarios_CTS=controlador(async req=>{
  const query=consulta(req.query,['rol','estado','cliente_id']),where={};
  if(query.rol!==undefined) where.rol=opcion(query.rol,'rol',roles);
  if(query.estado!==undefined) where.estado=opcion(query.estado,'estado',estados);
  if(query.cliente_id!==undefined) where.cliente_id=id(query.cliente_id,'cliente_id');
  const q=busqueda(query.q);if(q) where[Op.or]=['nombre','email'].map(field=>({[field]:{[Op.like]:`%${q}%`}}));
  return listar(UsuariosModel,query,{where,attributes:atributosUsuario,include:[clienteInclude]},['id','nombre','email','creado_en','actualizado_en'],'nombre');
});
export const OBRS_DetUsuario_CTS=controlador(async req=>{
  const row=await UsuariosModel.findByPk(id(req.params?.id),{attributes:atributosUsuario,include:[clienteInclude]});
  exigir(row,404,'NO_ENCONTRADO','Usuario no encontrado.');return {data:row};
});
export const CR_Usuario_CTS=controlador(async(req,actor)=>{
  const {input,data}=validar(req.body,true);
  exigir(data.rol==='ALUMNO'?data.cliente_id:data.cliente_id===null,422,'CLIENTE_REQUERIDO','ALUMNO requiere cliente_id; ADMIN debe tener cliente_id nulo.');
  data.estado??=input.password===undefined?'PENDIENTE':'ACTIVO';
  exigir(['PENDIENTE','ACTIVO'].includes(data.estado),422,'USUARIO_ESTADO','Crear la cuenta pendiente o activa.');
  exigir(data.estado==='ACTIVO'?input.password!==undefined:input.password===undefined,422,'PASSWORD_REQUERIDO','Una cuenta activa necesita contraseña; una pendiente se activa mediante enlace.');
  const hash=input.password===undefined?null:await hashPassword(input.password);
  const user=await conAuditoria(req,actor,'USUARIO_CREADO','usuarios',async transaction=>{
    if(data.cliente_id){const cliente=await ClientesModel.findByPk(data.cliente_id,{transaction,lock:transaction.LOCK.UPDATE});exigir(cliente?.activo===1,422,'CLIENTE_INVALIDO','El cliente no existe o está inactivo.');}
    const row=await UsuariosModel.create({...data,password_hash:hash,cambiar_password:hash?1:0},{transaction});await row.reload({transaction});
    return {entidadId:row.id,data:publicoUsuario(row),detalle:{rol:row.rol,cliente_id:row.cliente_id?String(row.cliente_id):null}};
  });return {status:201,message:'Cuenta creada correctamente.',data:user};
});
async function actualizar(req,actor,desactivar=false) {
  if(desactivar) camposPermitidos(req.body,[],{vacio:true});
  const data=desactivar?{estado:'INACTIVO'}:validar(req.body).data;
  const row=await conAuditoria(req,actor,desactivar?'USUARIO_DESACTIVADO':'USUARIO_ACTUALIZADO','usuarios',async transaction=>{
    const {user,cliente}=await bloquearUsuario(id(req.params?.id),transaction);
    const estado=data.estado??user.estado;
    if(estado==='ACTIVO'){exigir(hashValido(user.password_hash),422,'PASSWORD_REQUERIDO','Activar primero la cuenta con un enlace y contraseña válida.');exigirCliente(user,cliente);}
    if(estado==='PENDIENTE') exigir(!user.password_hash,422,'USUARIO_ESTADO','Una cuenta con contraseña debe usar recuperación.');
    if(user.rol==='ADMIN'&&user.estado==='ACTIVO'&&estado!=='ACTIVO') await conservarAdministrador(transaction);
    const revocar=['estado','email','cambiar_password'].some(key=>data[key]!==undefined&&data[key]!==user[key]);
    await user.update(data,{transaction});const counts=revocar?await revocarUsuario(user.id,transaction):{};await user.reload({transaction});
    return {entidadId:user.id,data:publicoUsuario(user),detalle:{campos:Object.keys(data),...counts}};
  });return {message:desactivar?'Cuenta desactivada correctamente.':'Cuenta actualizada correctamente.',data:row};
}
export const UR_Usuario_CTS=controlador((req,actor)=>actualizar(req,actor));
export const ER_Usuario_CTS=controlador((req,actor)=>actualizar(req,actor,true));
function emitir(tipo) {
  const action=controlador(async(req,actor)=>{
    camposPermitidos(req.body,[],{vacio:true});
    const result=await conAuditoria(req,actor,tipo+'_GENERADA','usuarios',async transaction=>{
      const {user,cliente}=await bloquearUsuario(id(req.params?.id),transaction);exigirCliente(user,cliente);
      return {entidadId:user.id,data:await emitirToken(user,transaction,tipo),detalle:{tipo}};
    });return {status:201,data:result};
  });return async(req,res)=>{res.setHeader('Cache-Control','no-store');return action(req,res);};
}
export const CR_ActivacionUsuario_CTS=emitir('ACTIVACION');
export const CR_RecuperacionUsuario_CTS=emitir('RECUPERACION');
export const ER_SesionesUsuario_CTS=controlador(async(req,actor)=>{
  camposPermitidos(req.body,[],{vacio:true});
  const result=await conAuditoria(req,actor,'USUARIO_CREDENCIALES_REVOCADAS','usuarios',async transaction=>{
    const {user}=await bloquearUsuario(id(req.params?.id),transaction),counts=await revocarUsuario(user.id,transaction);
    return {entidadId:user.id,data:{id:String(user.id),...counts},detalle:counts};
  });return {message:'Sesiones y enlaces pendientes revocados.',data:result};
});
