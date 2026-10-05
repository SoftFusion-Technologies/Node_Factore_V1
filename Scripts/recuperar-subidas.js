import db from '../src/DataBase/db.js';
import { validarConfiguracionDB } from '../src/DataBase/config.js';
import { recuperarSubidas } from '../src/Services/Archivo/recuperacionArchivo.service.js';
try {
  validarConfiguracionDB();await db.authenticate();
  const result=await recuperarSubidas();console.log(JSON.stringify(result));
  if(result.eliminaciones.some(row=>row.estado!=='COMPLETADA')) process.exitCode=1;
} catch(error) {console.error(JSON.stringify({error:error.original?.code||error.code||error.name||'ERROR'}));process.exitCode=1;}
finally {await db.close();}
