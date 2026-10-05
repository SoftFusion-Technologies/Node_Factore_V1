/* Benjamin Orellana - 05/10/2026 - Vista previa o limpieza manual de credenciales. */
import db from '../src/DataBase/db.js';
import { validarConfiguracionDB } from '../src/DataBase/config.js';
import { limpiarCredenciales } from '../src/Services/Sistema/limpiezaCredenciales.service.js';
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--aplicar')) throw Object.assign(new Error(), { code: 'ARGUMENTOS_INVALIDOS' });
  validarConfiguracionDB(); await db.authenticate();
  console.log(JSON.stringify(await limpiarCredenciales({ aplicar: args[0] === '--aplicar' })));
} catch (error) {
  console.error(JSON.stringify({ error: error.original?.code || error.code || error.name || 'ERROR' })); process.exitCode = 1;
} finally { await db.close(); }
