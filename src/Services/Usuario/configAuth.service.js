/* Benjamin Orellana - 05/10/2026 - Cookies de sesión y orígenes del frontend. */
import '../../DataBase/config.js';
import { exigir } from '../../utils/validacion.utils.js';
function frontend(value) {
  let url;try {url=new URL(value);} catch {}
  exigir(url&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash,500,'AUTH_CONFIGURACION','URL de frontend inválida.');
  return url;
}
export function configAuth() {
  const front=frontend(process.env.FRONTEND_URL||'http://localhost:5173');
  const origins=(process.env.ALLOWED_ORIGINS||`${front.origin},http://127.0.0.1:5173`).split(',').map(value=>{
    const url=frontend(value.trim());exigir(url.pathname==='/',500,'AUTH_CONFIGURACION','Los orígenes deben indicar solo protocolo, host y puerto.');return url.origin;
  });
  const secureValue=process.env.COOKIE_SECURE??(process.env.NODE_ENV==='production'?'true':'false');
  exigir(['true','false'].includes(secureValue),500,'AUTH_CONFIGURACION','COOKIE_SECURE inválido.');
  const secure=secureValue==='true',sameSite=(process.env.COOKIE_SAMESITE||'Lax').toLowerCase();
  exigir(['lax','strict','none'].includes(sameSite)&&!(sameSite==='none'&&!secure)&&!(process.env.NODE_ENV==='production'&&!secure),500,'AUTH_CONFIGURACION','Configuración de cookies inválida.');
  const hours=Number(process.env.SESSION_HOURS??12);
  exigir(Number.isInteger(hours)&&hours>=1&&hours<=168,500,'AUTH_CONFIGURACION','SESSION_HOURS debe estar entre 1 y 168.');
  return {front:front.toString().replace(/\/$/,''),origins:[...new Set(origins)],secure,sameSite,hours,cookieName:'factore_sid'};
}
export function leerCookie(req) {
  const values=String(req.headers?.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith('factore_sid='));
  if(values.length!==1) return null;
  const token=values[0].slice('factore_sid='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
}
export function cookieSesion(res,raw=null) {
  const config=configAuth(),age=raw?config.hours*3600:0;
  const value=`${config.cookieName}=${raw||''}; Path=/api; HttpOnly; SameSite=${config.sameSite[0].toUpperCase()+config.sameSite.slice(1)}; Max-Age=${age}${raw?'':'; Expires=Thu, 01 Jan 1970 00:00:00 GMT'}${config.secure?'; Secure':''}`;
  const current=res.getHeader?.('Set-Cookie');res.setHeader('Set-Cookie',[...(current?Array.isArray(current)?current:[current]:[]),value]);
}
export function verificarOrigen(req) {
  const config=configAuth(),origin=req.headers?.origin;
  exigir(origin===undefined||(typeof origin==='string'&&config.origins.includes(origin)),403,'ORIGEN_NO_PERMITIDO','Origen no permitido.');
}
export function exigirJson(req) {
  exigir(typeof req.headers?.['content-type']==='string'&&/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']),415,'JSON_REQUERIDO','Usar application/json.');
}
