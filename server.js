/* Benjamin Orellana - 05/10/2026 - Punto de entrada: npm start / npm run dev. */
import db from './src/DataBase/db.js';
import { iniciarLimpiezaCredenciales } from './src/Jobs/JB_LimpiarCredenciales.js';
import { prepararServidor, escuchar, cerrarServidor } from './src/Services/Sistema/servidor.service.js';

try {
  const { default: app } = await import('./app.js');
  await prepararServidor();
  const server = await escuchar(app);
  const address = server.address();
  console.log(`Factor E escuchando en ${address.address}:${address.port}. API: /api/status`);
  const mantenimiento = iniciarLimpiezaCredenciales();
  let closing = false;
  async function cerrar() {
    if (closing) return;
    closing = true;
    try {
      const mantenimientoTerminado = mantenimiento.detener();
      await cerrarServidor(server, { antesCerrarDB: () => mantenimientoTerminado });
    }
    catch (error) { console.error(JSON.stringify({ event: 'CIERRE_ERROR', code: error.code || error.name })); process.exitCode = 1; }
  }
  process.once('SIGINT', cerrar);
  process.once('SIGTERM', cerrar);
  server.on('error', error => {
    console.error(JSON.stringify({ event: 'SERVIDOR_ERROR', code: error.code || error.name }));
    process.exitCode = 1; void cerrar();
  });
} catch (error) {
  console.error(JSON.stringify({ event: 'ARRANQUE_ERROR', code: error.original?.code || error.code || error.name,
    message: 'No se pudo iniciar Factor E. Revisar .env, npm run modelos:db y el puerto de escucha.' }));
  await db.close();
  process.exitCode = 1;
}
