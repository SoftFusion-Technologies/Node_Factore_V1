/* Benjamin Orellana - 13/10/2026 - Una preferencia por compra; estados inciertos se conservan. */
import db from '../../DataBase/db.js';
import ComprasModel from '../../Models/Compra/MD_TB_Compras.js';
import { itemsPagoCompra } from './itemsPago.service.js';
import { cuentaCompraAgenda } from '../Agenda/agendaCompra.service.js';
import AgendaComprasModel from '../../Models/Agenda/MD_TB_AgendaCompras.js';
import AgendaVentaModel from '../../Models/Agenda/MD_TB_AgendaVentaConfiguracion.js';
import AgendaAccesosModel from '../../Models/Agenda/MD_TB_AgendaAccesos.js';
import CursosModel from '../../Models/Curso/MD_TB_Cursos.js';
import AuditoriaModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { identidadCompra,autorizarCompra,ahoraCompra } from './compra.service.js';
import { configuracionMP,cuerpoPreferencia,solicitarPreferencia,fecha,enlaceCheckout } from '../Pago/mercadoPago.service.js';
import { ErrorHttp,exigir } from '../../utils/validacion.utils.js';

export async function crearCheckout(referencia,token) {
  const tokenHash = identidadCompra(referencia,token);
  return checkout(referencia, tokenHash);
}

// Benjamin Orellana - 24/10/2026 - Agenda autentica a su comprador con la sesión del portal.
export async function crearCheckoutAgenda(referencia, req) {
  identidadCompra(referencia, '0'.repeat(64));
  return checkout(referencia, null, req);
}

async function checkout(referencia, tokenHash, req) {
  // CREANDO se confirma antes de la llamada externa: una interrupción no genera
  // otro POST a ciegas. La Preferences API no se asume idempotente.
  const task = await db.transaction(async transaction=>{
    const user = req ? await cuentaCompraAgenda(req, transaction) : null;
    const row = await ComprasModel.scope('conHash').findOne({where:{referencia},transaction,lock:transaction.LOCK.UPDATE});
    if (req) {
      const detail = row && await AgendaComprasModel.findOne({ where: { compra_id: row.id, usuario_id: user.id }, transaction });
      exigir(detail && String(row.usuario_id) === String(user.id), 404, 'COMPRA_NO_ENCONTRADA', 'Compra no encontrada.');
      const config = await AgendaVentaModel.findByPk('1', { transaction, lock: transaction.LOCK.SHARE });
      const access = await AgendaAccesosModel.findOne({ where: { usuario_id: user.id }, transaction, lock: transaction.LOCK.UPDATE });
      exigir(config?.venta_habilitada === 1, 409, 'AGENDA_VENTA_PAUSADA', 'La venta de Mi agenda está pausada.');
      exigir(!access || (access.estado === 'ACTIVO' && access.vence_en !== null), 409, 'AGENDA_COMPRA_REVISION', 'Revisar los permisos de la agenda antes de pagar.');
    } else autorizarCompra(row,tokenHash);
    exigir(row.estado === 'PENDIENTE' && await ahoraCompra(transaction) < fecha(row.vence_en),409,'COMPRA_NO_PAGABLE','La compra venció o ya no admite iniciar un pago.');
    const config = configuracionMP();
    exigir(config.modo !== 'PRODUCCION' || req,503,'MP_NO_CONFIGURADO','La venta de cursos no está habilitada en este entorno.');
    if(row.mp_preferencia_estado === 'DISPONIBLE')return {id:row.mp_preferencia_id,url:enlaceCheckout(row.mp_checkout_url,row.mp_preferencia_id,config.modo),vence_en:fecha(row.vence_en).toISOString(),reutilizada:true};
    exigir(row.mp_preferencia_estado === 'SIN_CREAR',409,'MP_CONFIRMACION_PENDIENTE','El intento de pago ya fue enviado y requiere confirmar su resultado antes de repetirlo.');
    const items = await itemsPagoCompra(row, transaction);
    exigir(items.length > 0,409,'COMPRA_INVALIDA','La compra no tiene cursos.');
    const cents=value=>{
      exigir(typeof value === 'string' && /^\d+\.\d{2}$/.test(value),409,'COMPRA_IMPORTE_INVALIDO','La compra requiere revisar sus importes.');
      return BigInt(value.replace('.',''));
    };
    exigir(items.every(item=>item.moneda === row.moneda) && items.reduce((sum,item)=>sum+cents(item.precio_unitario),0n) === cents(row.total),
      409,'COMPRA_IMPORTE_INVALIDO','El total de la compra no coincide con sus cursos.');
    for(const item of items.filter(item => item.tipo === 'CURSO')) {
      const course = await CursosModel.findByPk(item.curso_id,{transaction,lock:transaction.LOCK.SHARE});
      exigir(course && course.estado === 'PUBLICADO' && course.visible_catalogo === 1 && course.venta_online_habilitada === 1 && course.moneda === 'ARS',409,'CURSO_NO_COMPRABLE','Uno de los cursos ya no está disponible para iniciar el pago.');
    }
    const body = cuerpoPreferencia(row,items,config);
    if (items[0].tipo === 'AGENDA') {
      const retorno = new URL('/mi-agenda/compras/' + row.referencia, config.frontend).href;
      body.back_urls = { success: retorno, pending: retorno, failure: retorno };
    }
    await row.update({mp_preferencia_estado:'CREANDO',mp_error_codigo:null},{transaction});
    return {compraId:row.id,body,config,vence_en:fecha(row.vence_en).toISOString()};
  });
  if(task.reutilizada)return task;
  try {
    const result = await solicitarPreferencia(task.body,task.config);
    await db.transaction(async transaction=>{
      const row = await ComprasModel.findByPk(task.compraId,{transaction,lock:transaction.LOCK.UPDATE});
      // La recuperación puede encontrar este mismo link mientras la respuesta original llega.
      if(row?.mp_preferencia_estado==='DISPONIBLE' && row.mp_preferencia_id===result.id)return;
      exigir(row && row.mp_preferencia_estado === 'CREANDO',409,'MP_CONFIRMACION_PENDIENTE','El intento requiere revisión.');
      await row.update({mp_preferencia_estado:'DISPONIBLE',mp_preferencia_id:result.id,mp_checkout_url:result.url,mp_error_codigo:null},{transaction});
      await AuditoriaModel.create({usuario_id:null,accion:'MP_PREFERENCIA_CREADA',entidad:'compras',entidad_id:row.id,
        detalle:{preferencia_id:result.id}},{transaction});
    });
    return {...result,vence_en:task.vence_en,reutilizada:false};
  } catch(error) {
    // Un timeout, un proceso interrumpido o un error de DB no demuestran que
    // Mercado Pago no creó la preferencia. Se bloquea otro POST de creación.
    try { await ComprasModel.update({mp_preferencia_estado:'INCIERTA',mp_error_codigo:'MP_RESULTADO_INCIERTO'},
      {where:{id:task.compraId,mp_preferencia_estado:'CREANDO'}}); } catch { /* CREANDO también bloquea un nuevo POST. */ }
    throw new ErrorHttp(503,'MP_CONFIRMACION_PENDIENTE','No se pudo confirmar el link de pago. El intento quedó registrado para revisión.');
  }
}
