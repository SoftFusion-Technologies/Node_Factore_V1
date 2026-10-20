/* Benjamin Orellana - 13/10/2026 - Búsquedas de recuperación: exclusivamente GET. */
import { ErrorHttp,exigir,id } from '../../utils/validacion.utils.js';
import { fecha } from './mercadoPago.service.js';

export async function leerRecursoMP(path,config,fetchImpl=(...args)=>fetch(...args)) {
  // El path se construye dentro de este módulo, nunca se recibe del comprador.
  exigir(/^\/(?:checkout\/preferences|v1\/payments\/search)(?:[/?]|$)/.test(path),500,'MP_RUTA_INVALIDA','Ruta de consulta inválida.');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
  try {
    const response=await fetchImpl('https://api.mercadopago.com'+path,{method:'GET',redirect:'error',signal:abort.signal,
      headers:{Authorization:'Bearer '+config.token,Accept:'application/json'}});
    exigir(response.ok && (response.headers.get('content-type')||'').includes('application/json'),503,'MP_BUSQUEDA_PENDIENTE','No se pudo completar la búsqueda de Mercado Pago.');
    return await response.json();
  } catch(error) {
    if(error instanceof ErrorHttp)throw error;
    throw new ErrorHttp(503,'MP_BUSQUEDA_PENDIENTE','No se pudo completar la búsqueda de Mercado Pago.');
  } finally {clearTimeout(timer);}
}
export function idPreferenciaMP(value) {
  exigir(typeof value==='string' && /^[A-Za-z0-9_-]{1,180}$/.test(value),502,'MP_RESPUESTA_INVALIDA','ID de preferencia no verificable.');
  return value;
}
export async function buscarPreferenciaCompra(compra,config) {
  // Esta API limita la búsqueda a 90 días; un resultado vacío no prueba ausencia.
  const params=new URLSearchParams({external_reference:compra.referencia,limit:'2',offset:'0'});
  const result=await leerRecursoMP('/checkout/preferences/search?'+params,config);
  exigir(result && Number.isSafeInteger(result.total) && result.total>=0 && Array.isArray(result.elements),502,'MP_RESPUESTA_INVALIDA','Búsqueda de preferencias no verificable.');
  if(result.total>1)throw new ErrorHttp(409,'MP_MULTIPLES_PREFERENCIAS','Hay más de una preferencia; revisar antes de habilitar el link.');
  if(result.total===0)throw new ErrorHttp(409,'MP_PREFERENCIA_NO_ENCONTRADA','No se encontró una preferencia. El intento permanece bloqueado; no repetir su creación.');
  exigir(result.elements.length===1,502,'MP_RESPUESTA_INVALIDA','La búsqueda de preferencias está incompleta.');
  return idPreferenciaMP(result.elements[0].id);
}
export async function obtenerPreferenciaMP(preferenceId,config) {
  const result=await leerRecursoMP('/checkout/preferences/'+idPreferenciaMP(preferenceId),config);
  exigir(result && result.id===preferenceId,502,'MP_RESPUESTA_INVALIDA','La preferencia consultada no coincide.');
  return result;
}
export async function buscarPagosCompra(compra,config,clock) {
  const start=new Date(fecha(compra.creado_en).getTime()-1000);
  // Payments Search solo incluye los últimos 12 meses. No anunciar revisión
  // completa de una compra más antigua ni sustituir la ausencia por "no pagó".
  exigir(clock-start<364*86400000,409,'MP_HISTORIAL_REVISION','La compra requiere revisar el historial antiguo con IDs de pago conocidos.');
  let offset=0,total=null;const ids=new Set();
  do {
    const params=new URLSearchParams({external_reference:compra.referencia,sort:'date_created',criteria:'asc',
      range:'date_created',begin_date:start.toISOString(),end_date:clock.toISOString(),limit:'100',offset:String(offset)});
    const result=await leerRecursoMP('/v1/payments/search?'+params,config);
    const page=result?.paging;
    exigir(result && Array.isArray(result.results) && page && Number.isSafeInteger(page.total) && page.total>=0 && page.offset===offset &&
      Number.isSafeInteger(page.limit) && page.limit>0 && result.results.length<=page.limit,
      502,'MP_RESPUESTA_INVALIDA','La paginación de pagos no es verificable.');
    // Protección explícita frente a una compra anómala, nunca éxito con recorte.
    exigir(page.total<=10000,409,'MP_BUSQUEDA_EXCESIVA','Demasiados pagos para esta compra; requiere revisión.');
    exigir(total===null || total===page.total,503,'MP_BUSQUEDA_CAMBIO','La búsqueda cambió durante la consulta; reintentar la revisión.');
    total=page.total;
    exigir(offset+result.results.length<=total && (result.results.length>0 || offset===total),502,'MP_RESPUESTA_INVALIDA','La búsqueda de pagos está incompleta.');
    for(const row of result.results) {
      exigir(row.external_reference===compra.referencia,502,'MP_RESPUESTA_INVALIDA','La búsqueda devolvió una compra distinta.');
      const pagoId=id(row.id);
      exigir(!ids.has(pagoId),503,'MP_BUSQUEDA_CAMBIO','La búsqueda repitió un pago; reintentar la revisión.');
      ids.add(pagoId);
    }
    offset+=result.results.length;
  } while(offset<total);
  return [...ids];
}
