import '../src/DataBase/config.js';
import { inicializarStorage } from '../src/Services/Archivo/rutasArchivo.service.js';
try {
  await inicializarStorage();
  console.log('Almacenamiento privado inicializado: 4 carpetas. No se abrió una conexión a MySQL.');
} catch(error) {console.error(JSON.stringify({error:error.code||error.name||'ERROR'}));process.exitCode=1;}
