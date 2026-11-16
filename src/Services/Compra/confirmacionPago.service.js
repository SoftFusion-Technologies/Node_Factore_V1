/* Benjamin Orellana - 13/10/2026 - Confirmación transaccional; sin cuentas ni accesos. */
import db from '../../DataBase/db.js';
import ComprasModel from '../../Models/Compra/MD_TB_Compras.js';
import AgendaComprasModel from '../../Models/Agenda/MD_TB_AgendaCompras.js';
import PagosModel from '../../Models/Compra/MD_TB_CompraPagos.js';
import { itemsPagoCompra } from './itemsPago.service.js';
import { entregarAgendaCompra } from '../Agenda/agendaCompra.service.js';
import AuditoriaModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { ahoraCompra } from './compra.service.js';
import { fecha, enlaceCheckout } from '../Pago/mercadoPago.service.js';
import { configuracionConfirmacionMP, consultarPagoMP } from '../Pago/consultaPago.service.js';
import { exigir } from '../../utils/validacion.utils.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const cents=value=>BigInt(value.replace('.',''));
const firmaEstado=row=>JSON.stringify([row.estado,row.detalle_estado,row.importe,row.importe_reintegrado,row.moneda,
  row.aprobado_en ? fecha(row.aprobado_en).toISOString():null]);

export async function confirmarPagoMP(pagoId,{referenciaEsperada}={}) {
  const payment=await consultarPagoMP(pagoId,configuracionConfirmacionMP());
  if(referenciaEsperada!==undefined)exigir(payment.referencia===referenciaEsperada,503,'MP_PAGO_NO_VERIFICADO','El pago consultado no corresponde a esta compra.');
  // Una cuenta puede tener otras integraciones. Ignorar pagos sin compra propia.
  if(typeof payment.referencia!=='string' || !uuid.test(payment.referencia))return {ignorada:true};
  const result = await db.transaction(async transaction=>{
    // Todos los intentos de una compra usan el mismo bloqueo, también si son pagos distintos.
    const compra=await ComprasModel.findOne({where:{referencia:payment.referencia},transaction,lock:transaction.LOCK.UPDATE});
    if(!compra)return {ignorada:true};
    exigir(compra.mp_preferencia_id && compra.mp_preferencia_id===payment.preferenciaId,
      503,'MP_PREFERENCIA_NO_VERIFICADA','El pago requiere resolver la vinculación de su preferencia.');
    if (payment.modoPrueba === 0) {
      const agenda = await AgendaComprasModel.findOne({where:{compra_id:compra.id},transaction});
      exigir(agenda && String(agenda.usuario_id) === String(compra.usuario_id),503,'MP_PAGO_NO_VERIFICADO','La compra no corresponde a Agenda.');
      enlaceCheckout(compra.mp_checkout_url,compra.mp_preferencia_id,'PRODUCCION');
    }
    const previous=await PagosModel.findOne({where:{mp_pago_id:pagoId},transaction,lock:transaction.LOCK.UPDATE});
    exigir(!previous || String(previous.compra_id)===String(compra.id),503,'MP_PAGO_NO_VERIFICADO','El pago ya pertenece a otra compra.');
    exigir(!previous || previous.modo_prueba === payment.modoPrueba,503,'MP_ENTORNO_NO_VERIFICADO','El pago ya fue registrado en otro entorno.');
    const now=await ahoraCompra(transaction);
    exigir(payment.mp_actualizado_en.getTime()<=now.getTime()+300000,503,'MP_FECHA_NO_VERIFICADA','La actualización del pago tiene una fecha no verificable.');
    if(previous && fecha(previous.mp_actualizado_en)>payment.mp_actualizado_en)return {ignorada:true};
    if(previous && fecha(previous.mp_actualizado_en).getTime()===payment.mp_actualizado_en.getTime() && firmaEstado(previous)===firmaEstado(payment))return {repetida:true};
    let reason=null;
    if(previous && fecha(previous.mp_actualizado_en).getTime()===payment.mp_actualizado_en.getTime())reason='MP_VERSION_CONFLICTO';
    else if(payment.moneda!==compra.moneda)reason='MP_MONEDA_DISTINTA';
    else if(payment.importe!==compra.total)reason='MP_IMPORTE_DISTINTO';
    else if(cents(payment.importe_reintegrado)>0n || ['refunded','charged_back','in_mediation'].includes(payment.estado))reason='MP_REINTEGRO_O_DISPUTA';
    else if(!['approved','pending','in_process','authorized','rejected','cancelled'].includes(payment.estado))reason='MP_ESTADO_NO_ADMITIDO';
    if(!reason && payment.estado==='approved') {
      const items=await itemsPagoCompra(compra,transaction);
      if(!items.length || items.some(item=>item.moneda!==compra.moneda) || items.reduce((sum,item)=>sum+cents(item.precio_unitario),0n)!==cents(compra.total))reason='COMPRA_IMPORTE_INVALIDO';
      else if(payment.detalle_estado!=='accredited' || !payment.aprobado_en)reason='MP_APROBACION_NO_ACREDITADA';
      else if(payment.aprobado_en<fecha(compra.creado_en) || payment.aprobado_en>=fecha(compra.vence_en))reason='MP_PAGO_FUERA_PLAZO';
      else if(payment.aprobado_en>payment.mp_actualizado_en)reason='MP_FECHA_NO_VERIFICADA';
      else if(compra.estado==='CANCELADA')reason='COMPRA_CANCELADA';
      else {
        const other=await PagosModel.findAll({where:{compra_id:compra.id},transaction});
        if(other.some(row=>String(row.mp_pago_id)!==pagoId && row.estado==='approved' && row.validacion==='VALIDADO') ||
          compra.estado==='PAGADA' && previous?.estado!=='approved')reason='MP_PAGO_DUPLICADO';
      }
    }
    if(!reason && compra.estado==='PAGADA' && previous?.estado==='approved' && payment.estado!=='approved')reason='MP_PAGO_CAMBIO_ESTADO';
    // Una incidencia financiera ya detectada se resuelve manualmente, no por un
    // replay posterior de "approved". La compra PAGADA conserva el hecho histórico.
    if(!reason && previous?.validacion==='REVISION')reason=previous.motivo_revision;
    const values={compra_id:compra.id,mp_pago_id:pagoId,estado:payment.estado,detalle_estado:payment.detalle_estado,
      validacion:reason?'REVISION':'VALIDADO',motivo_revision:reason,importe:payment.importe,
      importe_reintegrado:payment.importe_reintegrado,moneda:payment.moneda,modo_prueba:payment.modoPrueba,
      mp_actualizado_en:payment.mp_actualizado_en,aprobado_en:payment.aprobado_en,verificado_en:now};
    if(previous)await previous.update(values,{transaction});
    else await PagosModel.create(values,{transaction});
    await AuditoriaModel.create({usuario_id:null,accion:reason?'MP_PAGO_REVISION':'MP_PAGO_VERIFICADO',entidad:'compras',entidad_id:compra.id,
      detalle:{pago_id:pagoId,estado:payment.estado,motivo:reason}},{transaction});
    if(!reason && payment.estado==='approved' && compra.estado==='PENDIENTE') {
      await compra.update({estado:'PAGADA',pagada_en:payment.aprobado_en},{transaction});
      await AuditoriaModel.create({usuario_id:null,accion:'COMPRA_PAGADA',entidad:'compras',entidad_id:compra.id,
        detalle:{pago_id:pagoId,total:compra.total,moneda:compra.moneda}},{transaction});
    }
    return {registrada:true};
  });
  // Benjamin Orellana - 24/10/2026 - Un replay también recupera una entrega interrumpida.
  await entregarAgendaCompra(payment.referencia);
  return result;
}
