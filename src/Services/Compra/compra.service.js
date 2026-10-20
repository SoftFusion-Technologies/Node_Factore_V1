import PagosModel from '../../Models/Compra/MD_TB_CompraPagos.js';
/* Benjamin Orellana - 13/10/2026 - Compras previas al pago, sin habilitar cuentas. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import ComprasModel from '../../Models/Compra/MD_TB_Compras.js';
import CompraItemsModel from '../../Models/Compra/MD_TB_CompraItems.js';
import CursosModel from '../../Models/Curso/MD_TB_Cursos.js';
import AuditoriaModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { initRelaciones } from '../../Models/relaciones.js';
import { camposPermitidos, exigir, id, texto, email } from '../../utils/validacion.utils.js';
initRelaciones();

const digest = value => createHash('sha256').update(value).digest('hex');
const plazoMs = 15 * 60 * 1000;
export function identidadCompra(referencia, token) {
  exigir(typeof referencia === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(referencia),422,'COMPRA_INVALIDA','Referencia de compra inválida.');
  exigir(typeof token === 'string' && /^[0-9a-f]{64}$/.test(token),422,'COMPRA_INVALIDA','Identificador privado de compra inválido.');
  return digest(token);
}
function validar(input) {
  const body = camposPermitidos(input,['referencia','nombre','email','curso_ids']);
  const nombre = texto(body.nombre,'nombre',180), correo = email(body.email,'email');
  exigir(correo,422,'COMPRA_INVALIDA','Informar el email del comprador.');
  exigir(Array.isArray(body.curso_ids) && body.curso_ids.length > 0 && body.curso_ids.length <= 50,422,'COMPRA_INVALIDA','Seleccionar entre 1 y 50 cursos.');
  const ids = body.curso_ids.map(value => id(value,'curso'));
  exigir(new Set(ids).size === ids.length,422,'COMPRA_INVALIDA','Un curso no puede repetirse en la compra.');
  ids.sort((a,b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
  return {nombre,correo,ids,solicitudHash:digest(JSON.stringify([nombre,correo,ids]))};
}
export function autorizarCompra(row, tokenHash) {
  exigir(row && timingSafeEqual(Buffer.from(row.token_hash,'hex'),Buffer.from(tokenHash,'hex')),404,'COMPRA_NO_ENCONTRADA','Compra no encontrada.');
}
export async function ahoraCompra(transaction) {
  const [row] = await db.query('SELECT UTC_TIMESTAMP(3) AS ahora',{type:QueryTypes.SELECT,transaction});
  return row.ahora instanceof Date ? row.ahora : new Date(row.ahora.replace(' ','T')+'Z');
}
function centavos(precio) {
  exigir(typeof precio === 'string' && /^\d+(?:\.\d{1,2})?$/.test(precio),422,'CURSO_NO_COMPRABLE','El curso no tiene un precio válido.');
  const [whole,fraction=''] = precio.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'));
}
function decimal(value) { return (value / 100n).toString()+'.'+(value % 100n).toString().padStart(2,'0'); }
async function resumen(row, transaction, clock) {
  const items = await CompraItemsModel.findAll({where:{compra_id:row.id},order:[['id','ASC']],transaction});
  const vencimiento = row.vence_en instanceof Date ? row.vence_en : new Date(row.vence_en.replace(' ','T')+'Z');
  return {referencia:row.referencia,estado:row.estado,
    estado_temporal:row.estado === 'PENDIENTE' && clock >= vencimiento ? 'VENCIDA' : row.estado,
    total:row.total,moneda:row.moneda,vence_en:vencimiento.toISOString(),
    pago:{requiere_revision:await PagosModel.count({where:{compra_id:row.id,validacion:'REVISION'},transaction})>0},
    mercadopago:{estado:row.mp_preferencia_estado,url:row.mp_preferencia_estado==='DISPONIBLE' && row.estado==='PENDIENTE' && clock<vencimiento?row.mp_checkout_url:null},
    items:items.map(item=>({curso_id:String(item.curso_id),titulo:item.titulo,slug:item.slug,precio:item.precio_unitario,
      moneda:item.moneda,acceso_duracion_cantidad:item.acceso_duracion_cantidad,acceso_duracion_unidad:item.acceso_duracion_unidad}))};
}
async function auditar(row, accion, transaction, cantidad) {
  await AuditoriaModel.create({usuario_id:null,accion,entidad:'compras',entidad_id:row.id,
    detalle:{cantidad_cursos:cantidad,total:row.total,moneda:row.moneda}},{transaction});
}

// El llamador genera referencia UUIDv4 y token aleatorio de 32 bytes ANTES de enviar.
// Un reintento usa ambos valores originales y recupera la misma compra.
export async function crearCompra(input, token) {
  const validated = validar(input), tokenHash = identidadCompra(input.referencia,token);
  async function repetida(row, transaction, clock) {
    autorizarCompra(row,tokenHash);
    exigir(row.solicitud_hash === validated.solicitudHash,409,'COMPRA_REINTENTO_DISTINTO','La referencia ya corresponde a otra solicitud.');
    return {...await resumen(row,transaction,clock),reutilizada:true};
  }
  try {
    return await db.transaction(async transaction => {
      const clock = await ahoraCompra(transaction);
      const existing = await ComprasModel.scope('conHash').findOne({where:{referencia:input.referencia},transaction,lock:transaction.LOCK.UPDATE});
      if(existing) return repetida(existing,transaction,clock);
      const items = []; let total = 0n;
      for(const cursoId of validated.ids) {
        const curso = await CursosModel.findByPk(cursoId,{transaction,lock:transaction.LOCK.SHARE});
        exigir(curso && curso.estado === 'PUBLICADO' && curso.visible_catalogo === 1 && curso.venta_online_habilitada === 1 && curso.moneda === 'ARS',422,'CURSO_NO_COMPRABLE','Uno de los cursos no está habilitado para compra online.');
        const importe = centavos(curso.precio);
        exigir(importe > 0n,422,'CURSO_NO_COMPRABLE','La compra requiere un precio positivo.');
        total += importe;
        exigir(total <= 99999999999999n,422,'COMPRA_IMPORTE_INVALIDO','El total supera el importe admitido.');
        items.push({curso_id:curso.id,titulo:curso.titulo,slug:curso.slug,precio_unitario:decimal(importe),moneda:curso.moneda,
          acceso_duracion_cantidad:curso.acceso_duracion_cantidad,acceso_duracion_unidad:curso.acceso_duracion_unidad});
      }
      const row = await ComprasModel.create({referencia:input.referencia,token_hash:tokenHash,solicitud_hash:validated.solicitudHash,
        comprador_nombre:validated.nombre,comprador_email:validated.correo,usuario_id:null,estado:'PENDIENTE',
        moneda:'ARS',total:decimal(total),creado_en:clock,vence_en:new Date(clock.getTime()+plazoMs)},{transaction});
      for(const item of items) await CompraItemsModel.create({...item,compra_id:row.id},{transaction});
      await row.reload({transaction});
      await auditar(row,'COMPRA_CREADA',transaction,items.length);
      return {...await resumen(row,transaction,clock),reutilizada:false};
    });
  } catch(error) {
    if(error.name !== 'SequelizeUniqueConstraintError' && error.original?.code !== 'ER_DUP_ENTRY') throw error;
    const existing = await ComprasModel.scope('conHash').findOne({where:{referencia:input.referencia}});
    if(!existing) throw error;
    return repetida(existing,undefined,await ahoraCompra());
  }
}

export async function obtenerCompra(referencia, token) {
  const tokenHash = identidadCompra(referencia,token);
  return db.transaction(async transaction => {
    const row = await ComprasModel.scope('conHash').findOne({where:{referencia},transaction,lock:transaction.LOCK.SHARE});
    autorizarCompra(row,tokenHash);
    return resumen(row,transaction,await ahoraCompra(transaction));
  });
}

export async function cancelarCompra(referencia, token) {
  const tokenHash = identidadCompra(referencia,token);
  return db.transaction(async transaction => {
    const row = await ComprasModel.scope('conHash').findOne({where:{referencia},transaction,lock:transaction.LOCK.UPDATE});
    autorizarCompra(row,tokenHash);
    exigir(row.estado !== 'PAGADA',409,'COMPRA_PAGADA','Una compra pagada requiere gestionar el pago.');
    exigir(['SIN_CREAR','ERROR'].includes(row.mp_preferencia_estado),409,'COMPRA_CANCELACION_MP','La compra tiene un intento de pago; primero debe resolverse con Mercado Pago.');
    if(row.estado !== 'CANCELADA') {
      await row.update({estado:'CANCELADA'},{transaction});
      await auditar(row,'COMPRA_CANCELADA',transaction,await CompraItemsModel.count({where:{compra_id:row.id},transaction}));
    }
    return resumen(row,transaction,await ahoraCompra(transaction));
  });
}
