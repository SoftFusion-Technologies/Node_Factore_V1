/* Pide credenciales por terminal; no acepta contraseña en argumentos o variables. */
import { createInterface } from 'node:readline/promises';
import db from '../src/DataBase/db.js';
import { validarConfiguracionDB } from '../src/DataBase/config.js';
import { exigir } from '../src/utils/validacion.utils.js';
import { crearPrimerAdmin } from '../src/Services/Usuario/primerAdmin.service.js';
import UsuariosModel from '../src/Models/Usuario/MD_TB_Usuarios.js';
import { passwordOculta } from '../src/utils/terminal.utils.js';

try {
  exigir(process.stdin.isTTY&&process.stdout.isTTY,422,'TERMINAL_REQUERIDA','Ejecutar desde una terminal interactiva.');
  validarConfiguracionDB();await db.authenticate();
  exigir(await UsuariosModel.count({where:{rol:'ADMIN'}})===0,409,'ADMIN_EXISTENTE','Ya existe un administrador. Usar la gestión de usuarios.');
  const reader=createInterface({input:process.stdin,output:process.stdout});
  let nombre,email;
  try {nombre=(await reader.question('Nombre del administrador: ')).trim();email=(await reader.question('Email del administrador: ')).trim();} finally {reader.close();}
  console.log('La contraseña necesita 15 a 128 caracteres. La entrada queda oculta.');
  const password=await passwordOculta('Contraseña: '),confirmation=await passwordOculta('Repetir contraseña: ');
  exigir(password===confirmation,422,'PASSWORD_CONFIRMACION','Las contraseñas no coinciden.');
  const user=await crearPrimerAdmin({nombre,email,password});
  console.log(JSON.stringify({creado:true,id:String(user.id),email:user.email,cambiar_password:1}));
} catch(error) {console.error(error.status?error.message:JSON.stringify({error:error.original?.code||error.code||error.name||'ERROR'}));process.exitCode=1;}
finally {await db.close();}
