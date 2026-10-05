/* Benjamin Orellana - 04/10/2026 - Conexión Sequelize de Factor E, sin sincronización automática. */
import { Sequelize } from 'sequelize';
import { readFileSync } from 'node:fs';
import {
  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SOCKET,
  DB_POOL_SIZE, DB_SSL, DB_SSL_CA_FILE
} from './config.js';

const db = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false,
  timezone: '+00:00',
  // mysql2 devuelve BIGINT y DECIMAL como cadenas para conservar precisión.
  dialectOptions: {
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    typeCast: true,
    ...(DB_SOCKET ? { socketPath: DB_SOCKET } : {}),
    ...(DB_SSL ? { ssl: {
      rejectUnauthorized: true,
      ...(DB_SSL_CA_FILE ? { ca: readFileSync(DB_SSL_CA_FILE) } : {})
    } } : {})
  },
  pool: { max: DB_POOL_SIZE, min: 0, acquire: 30000, idle: 10000 },
  define: { freezeTableName: true, timestamps: false },
  retry: { max: 0 }
});

// Importar modelos y relaciones no abre conexiones ni modifica la estructura.
// Las fechas creado_en/actualizado_en y las restricciones pertenecen al SQL instalado.
export default db;
