/* Benjamin Orellana - 06/10/2026 - Cierre integral de DESA sin escrituras. */
import db from '../src/DataBase/db.js';
import { validarConfiguracionDB } from '../src/DataBase/config.js';
import { validarDesa } from '../src/Services/Sistema/validacionDesa.service.js';

try {
  const args = process.argv.slice(2);
  if (new Set(args).size !== args.length || args.some(x => !['--db', '--hash'].includes(x))
    || (args.includes('--hash') && !args.includes('--db'))) throw new Error('ARGUMENTOS_INVALIDOS');
  if (!args.includes('--db')) {
    console.log(JSON.stringify({ local: true, conexion_mysql: false, comando: 'node Scripts/validar-desa.js --db --hash' }));
  } else {
    validarConfiguracionDB();
    await db.authenticate();
    const result = await validarDesa({ hash: args.includes('--hash') });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
} catch {
  console.error(JSON.stringify({ error: 'VALIDACION_DESA_NO_COMPLETADA', detalle: 'Revisar argumentos, configuración y conexión; no se modificaron registros.' }));
  process.exitCode = 1;
} finally { await db.close(); }
