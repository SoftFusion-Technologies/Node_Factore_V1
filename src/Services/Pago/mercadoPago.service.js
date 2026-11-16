/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 13/10/2026 - Checkout Pro de prueba; credenciales solo en backend. */
import { isIP } from 'node:net';
import { ErrorHttp, exigir, id } from '../../utils/validacion.utils.js';

function httpsPublica(value) {
  let url;
  try { url = new URL(value); } catch { throw new ErrorHttp(503,'MP_NO_CONFIGURADO','Configurar las URLs públicas de Mercado Pago.'); }
  exigir(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
    !isIP(url.hostname) && url.hostname.includes('.') && !url.hostname.endsWith('.localhost') && url.hostname !== 'localhost',
    503,'MP_NO_CONFIGURADO','Mercado Pago requiere URLs públicas HTTPS.');
  return url;
}
export function configuracionMP() {
  exigir(process.env.MP_HABILITADO === 'true',503,'MP_NO_CONFIGURADO','El pago online no está disponible.');
  const modo = process.env.MP_MODO || 'PRUEBA';
  const produccion = modo === 'PRODUCCION';
  exigir(produccion ? process.env.NODE_ENV === 'production' :
    modo === 'PRUEBA' && process.env.NODE_ENV !== 'production',
    503,'MP_MODO_NO_ADMITIDO','Configurá el entorno correcto de Mercado Pago.');
  const token = process.env.MP_ACCESS_TOKEN;
  exigir(typeof token === 'string' && token.length >= 10 && !/\s/.test(token) &&
    (!produccion || token.startsWith('APP_USR-')),503,'MP_NO_CONFIGURADO','Completá las credenciales de Mercado Pago en el servidor.');
  const frontend = httpsPublica(process.env.MP_FRONTEND_URL), notification = httpsPublica(process.env.MP_NOTIFICATION_URL);
  let collector;
  if (produccion) {
    // Benjamin Orellana - 15/11/2026 - El retorno y webhook de cobros reales pertenecen a Factor E.
    const secret = process.env.MP_WEBHOOK_SECRET;
    try { collector = id(process.env.MP_COLLECTOR_ID); } catch { /* Validar sin mostrar datos. */ }
    exigir(collector && typeof secret === 'string' && secret.length >= 16 && !/\s/.test(secret) &&
      frontend.href === 'https://factore.com.ar/' &&
      notification.href === 'https://api.factore.com.ar/api/mercadopago/webhook',
      503,'MP_NO_CONFIGURADO','Revisá el vendedor, el webhook y las URLs de Factor E.');
  }
  return {token,frontend,notification,modo,collector};
}
export function mercadoPagoDisponible() {
  try { configuracionMP(); return true; }
  catch (error) { if (error instanceof ErrorHttp) return false; throw error; }
}
export function cuerpoPreferencia(compra, items, config) {
  const result = new URL('/compras/'+compra.referencia+'/resultado',config.frontend);
  return {external_reference:compra.referencia,
    items:items.map(item=>{
      const price = Number(item.precio_unitario);
      exigir(Number.isFinite(price) && price > 0 && price.toFixed(2) === item.precio_unitario,422,'MP_IMPORTE_INVALIDO','El importe no puede enviarse al proveedor.');
      return {id:String(item.producto_id ?? item.curso_id),title:item.titulo,currency_id:item.moneda,quantity:1,unit_price:price};
    }),
    payer:{name:compra.comprador_nombre,email:compra.comprador_email},
    expires:true,expiration_date_from:fecha(compra.creado_en).toISOString(),expiration_date_to:fecha(compra.vence_en).toISOString(),
    back_urls:{success:result.href+'?resultado=exito',pending:result.href+'?resultado=pendiente',failure:result.href+'?resultado=fallo'},
    auto_return:'approved',notification_url:config.notification.href};
}
export function fecha(value) { return value instanceof Date ? value : new Date(value.replace(' ','T')+'Z'); }
export function enlaceSandbox(value, preferenceId) {
  return enlaceCheckout(value, preferenceId, 'PRUEBA');
}
export function enlacePreferencia(result, config) {
  return enlaceCheckout(config.modo === 'PRODUCCION' ? result.init_point : result.sandbox_init_point, result.id, config.modo);
}
export function enlaceCheckout(value, preferenceId, modo = 'PRUEBA') {
  let url;
  try { url = new URL(value); } catch { throw new ErrorHttp(502,'MP_RESPUESTA_INVALIDA','El proveedor no devolvió un enlace válido para este entorno.'); }
  // Benjamin Orellana - 18/10/2026 - Admitir el sandbox argentino y el global mediante dominios exactos.
  const dominios = modo === 'PRODUCCION' ? ['www.mercadopago.com', 'www.mercadopago.com.ar'] :
    ['sandbox.mercadopago.com', 'sandbox.mercadopago.com.ar'];
  const dominioPermitido = dominios.includes(url.hostname);
  exigir(url.protocol === 'https:' && dominioPermitido && !url.port && !url.username && !url.password && !url.hash && url.searchParams.getAll('pref_id').length === 1 &&
    (url.pathname.startsWith('/mla/checkout/') || url.pathname.startsWith('/checkout/')) && url.searchParams.get('pref_id') === preferenceId,
    502,'MP_RESPUESTA_INVALIDA','El proveedor no devolvió un enlace válido para este entorno.');
  return url.href;
}
export async function solicitarPreferencia(body, config, fetchImpl=(...args)=>fetch(...args)) {
  const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),15000);
  try {
    const response = await fetchImpl('https://api.mercadopago.com/checkout/preferences',{method:'POST',redirect:'error',signal:abort.signal,
      headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
    exigir(response.ok && (response.headers.get('content-type')||'').includes('application/json'),502,'MP_SOLICITUD_FALLIDA','No se pudo confirmar la creación del link de pago.');
    const result = await response.json();
    exigir(typeof result.id === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(result.id),502,'MP_RESPUESTA_INVALIDA','El proveedor no devolvió una preferencia válida.');
    if (config.modo === 'PRODUCCION') {
      exigir(String(result.collector_id) === config.collector,502,'MP_VENDEDOR_INCORRECTO','La preferencia no pertenece al vendedor configurado.');
    }
    return {id:result.id,url:enlacePreferencia(result,config)};
  } catch(error) {
    if(error instanceof ErrorHttp) throw error;
    throw new ErrorHttp(502,'MP_SOLICITUD_FALLIDA','No se pudo confirmar la creación del link de pago.');
  } finally { clearTimeout(timer); }
}
