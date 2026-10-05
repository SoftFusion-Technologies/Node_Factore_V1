/* Benjamin Orellana - 04/10/2026 - Configuración centralizada de MySQL para Factor E. */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const loaded = dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
  override: false
});
if (loaded.error && loaded.error.code !== 'ENOENT') throw loaded.error;

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}
function boolean(name) {
  const value = process.env[name] ?? 'false';
  if (!['true', 'false'].includes(value)) throw new Error(`${name} debe ser true o false.`);
  return value === 'true';
}

export const DB_HOST = process.env.DB_HOST || '127.0.0.1';
export const DB_PORT = integer('DB_PORT', 3306, 1, 65535);
export const DB_NAME = process.env.DB_NAME || 'DB_FactoreDesa_04102026';
export const DB_USER = process.env.DB_USER || 'root';
export const DB_PASSWORD = process.env.DB_PASSWORD || '';
export const DB_SOCKET = process.env.DB_SOCKET || '';
export const DB_POOL_SIZE = integer('DB_POOL_SIZE', 10, 1, 100);
export const DB_SSL = boolean('DB_SSL');
export const DB_SSL_CA_FILE = process.env.DB_SSL_CA_FILE || '';

export function validarConfiguracionDB() {
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) throw new Error('DB_NAME inválido.');
  if (!DB_SOCKET && (!DB_PASSWORD || DB_PASSWORD === 'COMPLETAR_PASSWORD_MYSQL')) {
    throw new Error('Completar DB_USER y DB_PASSWORD en .env antes de verificar MySQL.');
  }
}
