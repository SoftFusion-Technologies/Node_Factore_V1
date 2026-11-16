/* Benjamin Orellana - 13/10/2026 - GET a endpoints fijos, sin aceptar URLs del webhook. */
import { configuracionMP } from './mercadoPago.service.js';
import { exigir, ErrorHttp, id } from '../../utils/validacion.utils.js';

export function configuracionConfirmacionMP() {
  const config = configuracionMP();
  let collector;
  try { collector = id(process.env.MP_COLLECTOR_ID); }
  catch { throw new ErrorHttp(503,'MP_COLLECTOR_NO_CONFIGURADO','Configurar el vendedor esperado.'); }
  return {...config,collector};
}
export function decimalMP(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  exigir(typeof text === 'string' && /^\d{1,12}(?:\.\d{1,2})?$/.test(text),502,'MP_RESPUESTA_INVALIDA','Importe de pago no verificable.');
  const [whole,fraction=''] = text.split('.');
  return whole+'.'+fraction.padEnd(2,'0');
}
export function fechaMP(value,nullable=false) {
  if(nullable && value===null)return null;
  exigir(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value),502,'MP_RESPUESTA_INVALIDA','Fecha de pago no verificable.');
  const result = new Date(value);
  exigir(Number.isFinite(result.getTime()),502,'MP_RESPUESTA_INVALIDA','Fecha de pago no verificable.');
  return result;
}
export async function consultarPagoMP(pagoId,config,fetchImpl=(...args)=>fetch(...args)) {
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
  async function get(path) {
    const response=await fetchImpl('https://api.mercadopago.com'+path,{method:'GET',redirect:'error',signal:abort.signal,
      headers:{Authorization:'Bearer '+config.token,Accept:'application/json'}});
    exigir(response.ok && (response.headers.get('content-type')||'').includes('application/json'),503,'MP_CONSULTA_PENDIENTE','No se pudo verificar el recurso; se requiere reintentar la notificación.');
    return response.json();
  }
  try {
    const payment=await get('/v1/payments/'+id(pagoId));
    exigir(id(payment.id)===pagoId && typeof payment.live_mode==='boolean' && id(payment.collector_id)===config.collector,
      503,'MP_PAGO_NO_VERIFICADO','El pago no pertenece al vendedor configurado.');
    // Benjamin Orellana - 18/10/2026 - En DESA, verificar el vendedor test_user cuando MP devuelve live_mode=true.
    // La etiqueta debe proceder del perfil del dueño del token, consultado por HTTPS;
    // no se acepta una marca del webhook, del comprador ni de una variable local.
    if (config.modo === 'PRODUCCION') {
      exigir(payment.live_mode === true,503,'MP_ENTORNO_NO_VERIFICADO','El pago no pertenece al entorno de producción.');
    } else if(payment.live_mode===true) {
      exigir(['development','test'].includes(process.env.NODE_ENV) && process.env.MP_MODO==='PRUEBA' && process.env.MP_HABILITADO==='true',
        503,'MP_ENTORNO_NO_VERIFICADO','Este pago requiere verificar el vendedor de prueba en DESA.');
      const response=await fetchImpl('https://api.mercadolibre.com/users/me',{method:'GET',redirect:'error',signal:abort.signal,
        headers:{Authorization:'Bearer '+config.token,Accept:'application/json'}});
      exigir(response.ok && (response.headers.get('content-type')||'').includes('application/json'),
        503,'MP_ENTORNO_NO_VERIFICADO','No se pudo verificar la clasificación del vendedor de prueba.');
      const owner=await response.json();
      exigir(id(owner.id)===config.collector && owner.site_id==='MLA' && Array.isArray(owner.tags) && owner.tags.includes('test_user'),
        503,'MP_ENTORNO_NO_VERIFICADO','El dueño del token no es el vendedor de prueba argentino configurado.');
    }
    exigir(payment.order?.type==='mercadopago',503,'MP_ORDEN_NO_VERIFICADA','No se pudo vincular el pago a Checkout Pro.');
    const orderId=id(payment.order.id),order=await get('/merchant_orders/'+orderId);
    exigir(id(order.id)===orderId && id(order.collector?.id)===config.collector && order.external_reference===payment.external_reference &&
      typeof order.preference_id==='string' && /^[A-Za-z0-9_-]{1,180}$/.test(order.preference_id) &&
      Array.isArray(order.payments) && order.payments.some(item=>id(item.id)===pagoId),
      503,'MP_ORDEN_NO_VERIFICADA','No se pudo vincular el pago a su preferencia.');
    exigir(typeof payment.status==='string' && /^[a-z_]{1,40}$/.test(payment.status) &&
      (payment.status_detail===null || typeof payment.status_detail==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(payment.status_detail)) &&
      typeof payment.currency_id==='string' && /^[A-Z]{3,10}$/.test(payment.currency_id),502,'MP_RESPUESTA_INVALIDA','Estado de pago no verificable.');
    // Devuelve solo datos operativos. Nunca guardar el JSON con payer/card.
    return {id:pagoId,modoPrueba:config.modo === 'PRODUCCION' ? 0 : 1,referencia:payment.external_reference,preferenciaId:order.preference_id,
      estado:payment.status,detalle_estado:payment.status_detail,importe:decimalMP(payment.transaction_amount),
      importe_reintegrado:decimalMP(payment.transaction_amount_refunded),moneda:payment.currency_id,
      aprobado_en:fechaMP(payment.date_approved,true),mp_actualizado_en:fechaMP(payment.date_last_updated)};
  } catch(error) {
    if(error instanceof ErrorHttp && error.status>=500)throw error;
    throw new ErrorHttp(503,'MP_CONSULTA_PENDIENTE','No se pudo verificar el recurso; se requiere reintentar la notificación.');
  } finally {clearTimeout(timer);}
}
