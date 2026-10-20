/* Benjamin Orellana - 13/10/2026 - Token de compra y límites de solicitudes anónimas. */
import { exigir } from '../utils/validacion.utils.js';
import { autenticarCompraNavegador,origenCompraNavegador } from '../Services/Compra/sesionCompra.service.js';
import { responderError } from '../utils/http.utils.js';
const limites = new Map();
export function tokenCompra(req,res,next) {
  try {
    exigir(Object.keys(req.query||{}).length === 0,422,'COMPRA_INVALIDA','Enviar los datos de compra en el cuerpo y el identificador privado en su cabecera.');
    const token = req.get('x-compra-token');
    exigir(typeof token === 'string' && /^[0-9a-f]{64}$/.test(token),401,'COMPRA_TOKEN_REQUERIDO','Falta el identificador privado de la compra.');
    req.compraToken=token;next();
  } catch(error) { return responderError(error,res); }
}
export function limitarCheckout(req,res,next) {
  try {
    const now = Date.now();
    for(const [key,value] of limites)if(value.vence<=now)limites.delete(key);
    const key = req.ip, previous=limites.get(key);
    exigir(previous || limites.size < 5000,429,'CHECKOUT_LIMITE','Hay demasiadas solicitudes. Reintentá en un minuto.');
    const limit = previous || {veces:0,creaciones:0,vence:now+60000};
    limit.veces++;if(req.method==='POST' && (req.path==='/api/checkout/compras' || /^\/api\/checkout\/navegador\/compras\/[0-9a-f-]{36}$/.test(req.path)))limit.creaciones++;
    limites.set(key,limit);
    if(limit.veces>120 || limit.creaciones>10)res.setHeader('Retry-After',String(Math.max(1,Math.ceil((limit.vence-now)/1000))));
    exigir(limit.veces<=120 && limit.creaciones<=10,429,'CHECKOUT_LIMITE','Hay demasiadas solicitudes. Reintentá en un minuto.');
    next();
  } catch(error) { return responderError(error,res); }
}

// Benjamin Orellana - 18/10/2026 - El navegador usa cookie y CSRF; la CLI conserva su transporte anterior.
export function origenNavegador(req,res,next) {
  try { origenCompraNavegador(req); next(); } catch(error) { return responderError(error,res); }
}
export async function cookieCompra(req,res,next) {
  try {
    exigir(Object.keys(req.query||{}).length===0,422,'COMPRA_INVALIDA','La compra no admite filtros libres.');
    req.compraSesion=await autenticarCompraNavegador(req,{escritura:!['GET','HEAD'].includes(req.method)}); next();
  } catch(error) { return responderError(error,res); }
}
