/* Benjamin Orellana - 05/10/2026 - Configuración del servidor, cargada desde .env. */
import '../../DataBase/config.js';
import { configAuth } from '../Usuario/configAuth.service.js';
import { limiteArchivo } from '../Archivo/subidaArchivo.service.js';

function entero(nombre, fallback, min, max) {
  const value = Number(process.env[nombre] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${nombre} inválido.`);
  return value;
}
export function configServidor() {
  configAuth();
  for (const tipo of ['VIDEO', 'IMAGEN', 'DOCUMENTO']) limiteArchivo(tipo);
  const host = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', '::1', '0.0.0.0', '::'].includes(host)) throw new Error('HOST debe ser una dirección de escucha válida.');
  // Solo habilitar loopback si un proxy local controlado es el único punto de entrada.
  const proxy = process.env.TRUST_PROXY ?? 'false';
  if (!['false', 'loopback'].includes(proxy)) throw new Error('TRUST_PROXY debe ser false o loopback.');
  return { host, port: entero('PORT', 3001, 1, 65535), trustProxy: proxy === 'false' ? false : 'loopback',
    uploadTimeout: entero('UPLOAD_TIMEOUT_MS', 1800000, 1000, 7200000) };
}
