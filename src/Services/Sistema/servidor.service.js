/* Benjamin Orellana - 05/10/2026 - Arranque y cierre ordenado del servidor. */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import { DB_NAME, validarConfiguracionDB } from '../../DataBase/config.js';
import { modelos } from '../../Models/index.js';
import { inicializarStorage } from '../Archivo/rutasArchivo.service.js';
import { configServidor } from './configServidor.service.js';

export async function prepararServidor() {
  validarConfiguracionDB();
  await db.authenticate();
  const [zona] = await db.query('SELECT @@session.time_zone AS zona', { type: QueryTypes.SELECT });
  if (zona.zona !== '+00:00') throw new Error('La conexión debe usar UTC.');
  const tables = await db.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=:schema',
    { replacements: { schema: DB_NAME }, type: QueryTypes.SELECT });
  const expected = [...Object.keys(modelos), 'vw_accesos_estado', 'vw_campus_lecciones_habilitadas', 'vw_campus_progreso_cursos', 'vw_campus_comercios_visibles'];
  if (expected.some(name => !tables.some(row => row.TABLE_NAME === name))) throw new Error('Faltan tablas o vistas; ejecutar npm run modelos:db.');
  await inicializarStorage();
}

export async function escuchar(app) {
  const config = configServidor();
  const server = createServer(app);
  // Node 18 corta peticiones a los 5 minutos por defecto; la subida tiene su propio límite.
  server.requestTimeout = config.uploadTimeout + 5000;
  server.headersTimeout = Math.min(60000, server.requestTimeout);
  server.keepAliveTimeout = 5000;
  server.listen(config.port, config.host);
  try { await once(server, 'listening'); }
  catch (error) { server.close(); throw error; }
  return server;
}

export async function cerrarServidor(server, { antesCerrarDB = async () => {} } = {}) {
  const force = setTimeout(() => server.closeAllConnections(), 10000);
  force.unref();
  try {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
  } finally {
    clearTimeout(force);
    try { await antesCerrarDB(); } finally { await db.close(); }
  }
}
