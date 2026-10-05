/* Benjamin Orellana - 05/10/2026 - Bootstrap exclusivo del primer administrador. */
import db from '../../DataBase/db.js';
import UsuariosModel from '../../Models/Usuario/MD_TB_Usuarios.js';
import AuditoriaModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { texto,email,exigir } from '../../utils/validacion.utils.js';
import { hashPassword } from '../../utils/password.utils.js';
import { publicoUsuario } from './usuarioEstado.service.js';
export async function crearPrimerAdmin({nombre,email:mail,password}) {
  const name=texto(nombre,'nombre',180),normalized=email(mail,'email');exigir(normalized,422,'DATOS_INVALIDOS','email es obligatorio.');
  exigir(await UsuariosModel.count({where:{rol:'ADMIN'}})===0,409,'ADMIN_EXISTENTE','Ya existe un administrador. Usar la gestión de usuarios.');
  const hash=await hashPassword(password);
  return db.transaction(async transaction=>{
    const rows=await UsuariosModel.findAll({where:{rol:'ADMIN'},attributes:['id'],transaction,lock:transaction.LOCK.UPDATE});
    exigir(rows.length===0,409,'ADMIN_EXISTENTE','Ya existe un administrador. Usar la gestión de usuarios.');
    const user=await UsuariosModel.create({nombre:name,email:normalized,rol:'ADMIN',cliente_id:null,estado:'ACTIVO',password_hash:hash,cambiar_password:1},{transaction});await user.reload({transaction});
    await AuditoriaModel.create({usuario_id:user.id,accion:'PRIMER_ADMIN_CREADO',entidad:'usuarios',entidad_id:user.id,detalle:{bootstrap:true}},{transaction});
    return publicoUsuario(user);
  });
}
