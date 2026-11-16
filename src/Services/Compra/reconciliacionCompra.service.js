/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 13/10/2026 - Recuperación administrativa sin crear otro cobro. */
import db from '../../DataBase/db.js';
import ComprasModel from '../../Models/Compra/MD_TB_Compras.js';
import { itemsPagoCompra } from './itemsPago.service.js';
import AgendaComprasModel from '../../Models/Agenda/MD_TB_AgendaCompras.js';
import PagosModel from '../../Models/Compra/MD_TB_CompraPagos.js';
import AuditoriaModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { ahoraCompra } from './compra.service.js';
import { confirmarPagoMP } from './confirmacionPago.service.js';
import { configuracionConfirmacionMP,decimalMP,fechaMP } from '../Pago/consultaPago.service.js';
import { fecha,enlacePreferencia } from '../Pago/mercadoPago.service.js';
import { buscarPreferenciaCompra,obtenerPreferenciaMP,buscarPagosCompra } from '../Pago/busquedaMP.service.js';
import { exigir,id,ErrorHttp } from '../../utils/validacion.utils.js';

const flights=new Set();
export function validarReferenciaReconciliacion(value) {
  exigir(typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),422,'COMPRA_INVALIDA','Referencia de compra inválida.');
  return value;
}
async function resumen(compra,recovered,processed,failures,sinIntento=false) {
  await compra.reload();
  const payments=await PagosModel.findAll({where:{compra_id:compra.id},attributes:['validacion','estado']});
  return {referencia:compra.referencia,estado:compra.estado,preferencia_estado:compra.mp_preferencia_estado,
    preferencia_recuperada:recovered,pagos_consultados:processed,pagos_registrados:payments.length,
    pagos_en_revision:payments.filter(row=>row.validacion==='REVISION').length,
    completa:failures.length===0,sin_intento_enviado:sinIntento,errores:failures};
}
function verificarPreferencia(pref,compra,items,config) {
  exigir(id(pref.collector_id)===config.collector && pref.external_reference===compra.referencia && pref.expires===true &&
    fechaMP(pref.expiration_date_from).getTime()===fecha(compra.creado_en).getTime() &&
    fechaMP(pref.expiration_date_to).getTime()===fecha(compra.vence_en).getTime(),
    409,'MP_PREFERENCIA_DISTINTA','La preferencia no coincide con vendedor, compra o vencimiento.');
  exigir(Array.isArray(pref.items) && pref.items.length===items.length && items.length>0,409,'MP_PREFERENCIA_DISTINTA','Los cursos de la preferencia no coinciden.');
  const seen=new Set();let cents=0n;
  for(const row of pref.items) {
    const courseId=String(row.id),item=items.find(item=>item.producto_id===courseId);
    exigir(item && !seen.has(courseId) && row.quantity===1 && compra.moneda==='ARS' && item.moneda===compra.moneda && row.currency_id===item.moneda &&
      decimalMP(row.unit_price)===item.precio_unitario,409,'MP_PREFERENCIA_DISTINTA','El importe o los cursos de la preferencia no coinciden.');
    seen.add(courseId);cents+=BigInt(item.precio_unitario.replace('.',''));
  }
  exigir(cents===BigInt(compra.total.replace('.','')),409,'COMPRA_IMPORTE_INVALIDO','La compra requiere revisar sus importes.');
  return enlacePreferencia(pref,config);
}
async function recuperarPreferencia(compra,config) {
  if(compra.mp_preferencia_id)return false;
  const prefId=await buscarPreferenciaCompra(compra,config),pref=await obtenerPreferenciaMP(prefId,config);
  const items=await itemsPagoCompra(compra),url=verificarPreferencia(pref,compra,items,config);
  return db.transaction(async transaction=>{
    const current=await ComprasModel.findByPk(compra.id,{transaction,lock:transaction.LOCK.UPDATE});
    if(current.mp_preferencia_id) {
      exigir(current.mp_preferencia_id===prefId,409,'MP_MULTIPLES_PREFERENCIAS','La compra tiene otra preferencia registrada.');
      return false;
    }
    exigir(['CREANDO','INCIERTA','ERROR'].includes(current.mp_preferencia_estado),409,'MP_RECONCILIACION_ESTADO','El estado de la compra cambió; volver a consultar.');
    exigir(current.referencia===compra.referencia && current.total===compra.total &&
      fecha(current.creado_en).getTime()===fecha(compra.creado_en).getTime() && fecha(current.vence_en).getTime()===fecha(compra.vence_en).getTime(),
      409,'MP_RECONCILIACION_ESTADO','Las condiciones de la compra cambiaron; volver a consultar.');
    await current.update({mp_preferencia_estado:'DISPONIBLE',mp_preferencia_id:prefId,mp_checkout_url:url,mp_error_codigo:null},{transaction});
    await AuditoriaModel.create({usuario_id:null,accion:'MP_PREFERENCIA_RECUPERADA',entidad:'compras',entidad_id:compra.id,
      detalle:{preferencia_id:prefId}},{transaction});
    return true;
  });
}

// Servicio administrativo interno. No exponer a compradores sin un permiso
// específico ni publicar una ruta que acepte una referencia libre como identidad.
export async function reconciliarCompra(referencia) {
  validarReferenciaReconciliacion(referencia);
  exigir(!flights.has(referencia),409,'MP_RECONCILIACION_EN_CURSO','Esta compra ya se está consultando.');
  flights.add(referencia);
  try {
    const compra=await ComprasModel.findOne({where:{referencia}});
    exigir(compra,404,'COMPRA_NO_ENCONTRADA','Compra no encontrada.');
    if(compra.mp_preferencia_estado==='SIN_CREAR' && !compra.mp_preferencia_id)return resumen(compra,false,0,[],true);
    const config=configuracionConfirmacionMP();
    if (config.modo === 'PRODUCCION') {
      const agenda = await AgendaComprasModel.findOne({where:{compra_id:compra.id}});
      exigir(agenda && String(agenda.usuario_id) === String(compra.usuario_id),503,'MP_NO_CONFIGURADO','Solo se concilian compras de Agenda en producción.');
    }
    const recovered=await recuperarPreferencia(compra,config);
    await compra.reload();
    // Primero completar la búsqueda. No marcar PAGADA a partir del resumen de Search.
    const discovered=await buscarPagosCompra(compra,config,await ahoraCompra());
    const known=await PagosModel.findAll({where:{compra_id:compra.id},attributes:['mp_pago_id']});
    const ids=[...new Set([...discovered,...known.map(row=>String(row.mp_pago_id))])];
    let processed=0;const failures=[];
    for(const pagoId of ids) {
      try {
        await confirmarPagoMP(pagoId,{referenciaEsperada:referencia});processed++;
      } catch(error) {
        // Cada pago es atómico; si el siguiente falla, conservar los ya verificados
        // y comunicar revisión incompleta. Reintentar es seguro.
        failures.push({pago_id:pagoId,codigo:error instanceof ErrorHttp?error.code:'ERROR_INTERNO'});
      }
    }
    return resumen(compra,recovered,processed,failures);
  } finally {flights.delete(referencia);}
}
