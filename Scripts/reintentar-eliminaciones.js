/* Reintenta operaciones pendientes contra la base y almacenamiento configurados. */
import db from '../src/DataBase/db.js';
import { validarConfiguracionDB } from '../src/DataBase/config.js';
import { reintentarEliminaciones } from '../src/Services/Archivo/archivoReferencias.service.js';
try {
  validarConfiguracionDB();
  await db.authenticate();
  const result = await reintentarEliminaciones();
  console.log(JSON.stringify({operaciones:result.length,resultados:result}));
  if (result.some(job => job.estado !== 'COMPLETADA')) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({error:error.original?.code || error.code || error.name || 'ERROR'}));
  process.exitCode = 1;
} finally { await db.close(); }
