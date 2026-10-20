/* Benjamin Orellana - 18/10/2026 - Credencial de checkout HttpOnly y CSRF ligado a cada compra. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import ComprasModel from '../../Models/Compra/MD_TB_Compras.js';
import { autorizarCompra, identidadCompra } from './compra.service.js';
import { configAuth } from '../Usuario/configAuth.service.js';
import { exigir } from '../../utils/validacion.utils.js';

const edad = 30 * 24 * 3600;
const hex = /^[0-9a-f]{64}$/;
const digest = raw => createHash('sha256').update(raw).digest('hex');
function referencia(req) {
  const ref = req.params.referencia;
  identidadCompra(ref, '0'.repeat(64));
  return ref;
}
function nombres(ref) {
  const suffix = ref.replaceAll('-', '');
  return { seguro: '__Host-fe_compra_' + suffix, local: 'fe_compra_local_' + suffix };
}
export function origenCompraNavegador(req) {
  const origin = req.headers.origin;
  exigir(typeof origin === 'string' && configAuth().origins.includes(origin), 403,
    'COMPRA_ORIGEN_REQUERIDO', 'Abrir la compra desde una dirección habilitada de Factor E.');
  const url = new URL(origin), secure = url.protocol === 'https:';
  exigir(secure || (['development', 'test'].includes(process.env.NODE_ENV) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 403,
  'COMPRA_HTTPS_REQUERIDO', 'El checkout requiere HTTPS.');
  return { secure };
}
function leerCredencial(req, ref) {
  const names = nombres(ref);
  const allowed = process.env.NODE_ENV === 'production' ? [names.seguro] : [names.seguro, names.local];
  const cookies = String(req.headers.cookie || '').split(';').map(value => value.trim())
    .filter(value => allowed.some(name => value.startsWith(name + '=')));
  exigir(cookies.length <= 1, 401, 'COMPRA_COOKIE_INVALIDA', 'La sesión de compra no es válida.');
  if (!cookies.length) return null;
  const raw = cookies[0].slice(cookies[0].indexOf('=') + 1);
  exigir(hex.test(raw), 401, 'COMPRA_COOKIE_INVALIDA', 'La sesión de compra no es válida.');
  return raw;
}
function csrf(raw, ref) {
  return createHmac('sha256', raw).update('factore:checkout:csrf:v1:' + ref).digest('hex');
}
async function verificarCompraSiExiste(ref, raw) {
  const row = await ComprasModel.scope('conHash').findOne({ where: { referencia: ref } });
  if (row) autorizarCompra(row, digest(raw));
}
function escribirCredencial(req, res, ref, raw) {
  const { secure } = origenCompraNavegador(req), names = nombres(ref);
  const value = `${secure ? names.seguro : names.local}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${edad}${secure ? '; Secure' : ''}`;
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(current ? Array.isArray(current) ? current : [current] : []), value]);
}
export async function prepararSesionCompra(req, res) {
  const ref = referencia(req);
  origenCompraNavegador(req);
  const anterior = req.headers['x-compra-token'];
  exigir(anterior === undefined || (typeof anterior === 'string' && hex.test(anterior)), 401,
    'COMPRA_TOKEN_REQUERIDO', 'El acceso anterior a la compra no es válido.');
  const cookie = leerCredencial(req, ref);
  // La cabecera solo se admite al migrar un acceso previo, nunca en las operaciones del navegador.
  const raw = anterior ?? cookie ?? randomBytes(32).toString('hex');
  await verificarCompraSiExiste(ref, raw);
  // No rotar aquí: una respuesta perdida debe poder recuperarse con la credencial anterior.
  escribirCredencial(req, res, ref, raw);
  return { referencia: ref, preparada: true };
}
export async function autenticarCompraNavegador(req, { escritura = true, csrfHeader = 'x-csrf-token' } = {}) {
  const ref = referencia(req);
  exigir(req.headers['x-compra-token'] === undefined, 422, 'COMPRA_CABECERA_NO_ADMITIDA',
    'Esta operación usa la sesión de compra del navegador.');
  const raw = leerCredencial(req, ref);
  exigir(raw, 401, 'COMPRA_COOKIE_REQUERIDA', 'Retomar la compra desde el navegador donde se inició.');
  if (escritura) {
    origenCompraNavegador(req);
    const recibido = req.headers[csrfHeader];
    exigir(typeof recibido === 'string' && hex.test(recibido) &&
      timingSafeEqual(Buffer.from(recibido, 'hex'), Buffer.from(csrf(raw, ref), 'hex')), 403,
    'COMPRA_CSRF_INVALIDO', 'Actualizar la compra antes de continuar.');
  }
  await verificarCompraSiExiste(ref, raw);
  req.compraToken = raw;
  return { referencia: ref, csrf_token: csrf(raw, ref) };
}
