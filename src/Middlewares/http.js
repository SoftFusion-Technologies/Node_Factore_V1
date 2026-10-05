/* Benjamin Orellana - 05/10/2026 - Transporte HTTP de Factor E. */
import express from 'express';
import { ErrorHttp } from '../utils/validacion.utils.js';
import { responderError } from '../utils/http.utils.js';
import { exigirJson, verificarOrigen } from '../Services/Usuario/configAuth.service.js';

export function cabecerasHttp(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

const metodos = ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
const headers = ['content-type', 'x-csrf-token', 'range'];
export function corsHttp(req, res, next) {
  try {
    verificarOrigen(req);
    const origin = req.headers.origin;
    res.vary('Origin');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition');
    }
    if (req.method !== 'OPTIONS') return next();
    const method = req.headers['access-control-request-method'];
    const requested = String(req.headers['access-control-request-headers'] || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    res.vary('Access-Control-Request-Method');
    res.vary('Access-Control-Request-Headers');
    if ((method && !metodos.includes(method)) || requested.some(x => !headers.includes(x))) {
      throw new ErrorHttp(403, 'CORS_NO_PERMITIDO', 'Método o cabecera no permitidos.');
    }
    res.setHeader('Access-Control-Allow-Methods', metodos.join(', '));
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
    return res.status(204).end();
  } catch (error) { return responderError(error, res); }
}

function jsonConLimite(limit) {
  const parser = express.json({ limit, strict: true, inflate: false, type: 'application/json' });
  return function cuerpoJson(req, res, next) {
    try { exigirJson(req); } catch (error) { return responderError(error, res); }
    parser(req, res, error => {
      if (error) return next(error);
      // DELETE y acciones sin argumentos también permiten un cuerpo vacío.
      if (req.body === undefined) req.body = {};
      next();
    });
  };
}
export const jsonGestion = jsonConLimite('1mb');
export const jsonAuth = jsonConLimite('16kb');
export const jsonCampus = jsonConLimite('16kb');

export function rutaNoEncontrada(req, res) {
  return responderError(new ErrorHttp(404, 'RUTA_NO_ENCONTRADA', 'Ruta no encontrada.'), res);
}
export function erroresHttp(error, req, res, next) {
  if (res.headersSent) { res.destroy(); return; }
  let mapped = error;
  if (error.type === 'entity.too.large') mapped = new ErrorHttp(413, 'JSON_TAMANIO', 'El cuerpo JSON supera el límite permitido.');
  else if (error.type === 'entity.parse.failed') mapped = new ErrorHttp(400, 'JSON_INVALIDO', 'Enviar un objeto JSON válido.');
  else if (['encoding.unsupported', 'charset.unsupported'].includes(error.type)) mapped = new ErrorHttp(415, 'CODIFICACION_NO_PERMITIDA', 'Usar JSON UTF-8 sin compresión.');
  else if (error instanceof URIError) mapped = new ErrorHttp(400, 'URL_INVALIDA', 'URL inválida.');
  else if (error.type === 'request.aborted') mapped = new ErrorHttp(400, 'PETICION_INTERRUMPIDA', 'La petición fue interrumpida.');
  return responderError(mapped, res);
}
