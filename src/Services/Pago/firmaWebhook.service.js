/* Benjamin Orellana - 13/10/2026 - Autenticidad de notificaciones payment. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { exigir, id } from '../../utils/validacion.utils.js';

export function verificarFirmaWebhook(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  exigir(process.env.MP_HABILITADO === 'true' && typeof secret === 'string' && secret.length >= 16 && !/\s/.test(secret),
    503, 'MP_WEBHOOK_NO_CONFIGURADO', 'Configurar el receptor de notificaciones de prueba.');
  const signature = req.headers['x-signature'], requestId = req.headers['x-request-id'];
  const invalid = () => exigir(false, 401, 'MP_FIRMA_INVALIDA', 'Notificación no autenticada.');
  if(typeof signature !== 'string' || signature.length > 250 || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(requestId))invalid();
  const parts = signature.split(',').map(part=>part.trim().split('='));
  if(parts.length !== 2 || parts.some(part=>part.length!==2) || new Set(parts.map(part=>part[0])).size!==2)invalid();
  const values = Object.fromEntries(parts), ts = values.ts, v1 = values.v1;
  if(!/^\d{10,13}$/.test(ts||'') || !/^[a-fA-F0-9]{64}$/.test(v1||''))invalid();
  // data.id de la URL es el dato firmado. No sustituirlo por un ID del cuerpo.
  let pagoId;
  try { pagoId = id(req.query['data.id']); } catch { invalid(); }
  const manifest = `id:${pagoId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256',secret).update(manifest).digest();
  if(!timingSafeEqual(expected,Buffer.from(v1,'hex')))invalid();
  // No cortar reintentos antiguos por edad: se vuelve a consultar el estado
  // actual del recurso y se aplica idempotencia en la base. ts es parte del HMAC.
  return pagoId;
}
