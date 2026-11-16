/* Benjamin Orellana - 24/10/2026 - Compra autenticada, precio congelado y entrega idempotente de Mi agenda. */
import { randomBytes, createHash } from 'node:crypto';
import { Op, literal, Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import { modelos as m } from '../../Models/index.js';
import { camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { hashToken } from '../../utils/password.utils.js';
import { sesionActual } from '../Usuario/auth.service.js';
import { bloquearUsuario } from '../Usuario/usuarioEstado.service.js';
import { mercadoPagoDisponible } from '../Pago/mercadoPago.service.js';
import { ahoraCompra, identidadCompra } from '../Compra/compra.service.js';
import { exigirPago, vencimientoCompra } from '../Compra/entregaCompra.service.js';
import { fechaGuardada, estadoTemporal } from '../Acceso/permisoAcceso.service.js';
import { siguienteVersion, segundosRegistro } from './agendaDatos.service.js';
import { vistaAcceso, auditarAgenda } from './agendaAcceso.service.js';

export function referenciaAgenda(value) {
  identidadCompra(value, '0'.repeat(64));
  return value;
}
function habilitarCuenta(user, cliente) {
  return user?.estado === 'ACTIVO' && user.cambiar_password === 0
    && (user.rol === 'ADMIN' || (user.rol === 'ALUMNO' && cliente?.activo === 1));
}
export async function cuentaCompraAgenda(req, transaction) {
  const session = await sesionActual(req);
  const { user, cliente } = await bloquearUsuario(session.usuario.id, transaction);
  exigir(habilitarCuenta(user, cliente), 401, 'SESION_INVALIDA', 'Iniciar sesión con una cuenta habilitada.');
  const row = await m.usuarios_sesiones.scope('conHash').findOne({ where: {
    id: session.id, usuario_id: user.id, token_hash: hashToken(req.sessionToken), revocada_en: null,
    vence_en: { [Op.gt]: literal('UTC_TIMESTAMP(3)') }
  }, transaction, lock: transaction.LOCK.SHARE });
  exigir(row, 401, 'SESION_INVALIDA', 'Iniciar sesión para continuar.');
  return user;
}
function permisoComprable(acceso) {
  exigir(!acceso || acceso.estado === 'ACTIVO', 409, 'AGENDA_COMPRA_REVISION',
    'Factor E debe revisar tu acceso suspendido o revocado antes de una compra.');
  exigir(!acceso || acceso.vence_en !== null, 409, 'AGENDA_YA_ILIMITADA', 'Tu agenda ya tiene acceso sin vencimiento.');
}
async function configuracion(ctx) {
  const row = await m.agenda_venta_configuracion.findByPk('1', { transaction: ctx.transaction, lock: ctx.transaction.LOCK.SHARE });
  exigir(row?.venta_habilitada === 1 && row.moneda === 'ARS' && BigInt(row.precio.replace('.', '')) > 0n,
    409, 'AGENDA_VENTA_PAUSADA', 'La venta de Mi agenda está pausada.');
  return row;
}
export async function ofertaAgenda(req, ctx) {
  camposPermitidos(req.query, [], { vacio: true });
  const row = await m.agenda_venta_configuracion.findByPk('1', { transaction: ctx.transaction });
  const pendiente = await m.compras.findOne({ where: { usuario_id: ctx.usuario.id, estado: 'PENDIENTE' },
    include: [{ model: m.agenda_compras, as: 'agenda_compras', required: true }],
    order: [['id', 'DESC']], transaction: ctx.transaction });
  return { disponible: row?.venta_habilitada === 1 && Number(row.precio) > 0 && mercadoPagoDisponible(),
    precio: row?.precio ?? null, moneda: 'ARS', acceso_duracion_cantidad: row?.acceso_duracion_cantidad ?? null,
    acceso_duracion_unidad: row?.acceso_duracion_unidad ?? null,
    acceso: vistaAcceso(ctx.acceso, ctx.ahora),
    compra_pendiente: pendiente?.referencia ?? null };
}
export async function compraPropiaAgenda(referencia, usuarioId, transaction) {
  const compra = await m.compras.findOne({ where: { referencia: referenciaAgenda(referencia), usuario_id: usuarioId },
    transaction, lock: transaction.LOCK.UPDATE });
  const item = compra && await m.agenda_compras.findOne({ where: { compra_id: compra.id, usuario_id: usuarioId },
    transaction, lock: transaction.LOCK.UPDATE });
  exigir(item, 404, 'COMPRA_NO_ENCONTRADA', 'Compra no encontrada.');
  return { compra, item };
}
export async function crearCompraAgenda(req, ctx) {
  const body = camposPermitidos(req.body, ['referencia']);
  referenciaAgenda(body.referencia);
  const anterior = await m.compras.findOne({ where: { referencia: body.referencia }, transaction: ctx.transaction });
  if (anterior) return resumenCompraAgenda(req, ctx, body.referencia);
  permisoComprable(ctx.acceso);
  const config = await configuracion(ctx);
  exigir(mercadoPagoDisponible(), 503, 'MP_NO_CONFIGURADO', 'El pago online no está disponible.');
  // Bloquear la cuenta serializa dobles clics y referencias distintas de dos pestañas.
  const pendientes = await m.compras.findAll({ where: { usuario_id: ctx.usuario.id, estado: 'PENDIENTE',
    vence_en: { [Op.gt]: ctx.ahora } }, include: [{ model: m.agenda_compras, as: 'agenda_compras', required: true }],
    transaction: ctx.transaction });
  exigir(!pendientes.length, 409, 'AGENDA_COMPRA_PENDIENTE', 'Ya tenés una compra pendiente. Retomala antes de iniciar otra.');
  const compra = await m.compras.create({ referencia: body.referencia,
    token_hash: hashToken(randomBytes(32).toString('hex')),
    solicitud_hash: createHash('sha256').update('AGENDA:' + ctx.usuario.id + ':' + body.referencia).digest('hex'),
    comprador_nombre: ctx.usuario.nombre, comprador_email: ctx.usuario.email, usuario_id: ctx.usuario.id,
    total: config.precio, moneda: 'ARS', vence_en: new Date(ctx.ahora.getTime() + 15 * 60000), creado_en: ctx.ahora
  }, { transaction: ctx.transaction });
  await m.agenda_compras.create({ compra_id: compra.id, usuario_id: ctx.usuario.id, precio_unitario: config.precio,
    moneda: 'ARS', acceso_duracion_cantidad: config.acceso_duracion_cantidad,
    acceso_duracion_unidad: config.acceso_duracion_unidad, configuracion_version: config.version }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_COMPRA_CREADA', 'compras', compra.id, { total: config.precio, moneda: 'ARS' });
  return resumenCompraAgenda(req, ctx, body.referencia);
}
export async function resumenCompraAgenda(req, ctx, referencia = req.params.referencia) {
  camposPermitidos(req.query, [], { vacio: true });
  const { compra, item } = await compraPropiaAgenda(referencia, ctx.usuario.id, ctx.transaction);
  const pagos = await m.compra_pagos.findAll({ where: { compra_id: compra.id }, transaction: ctx.transaction });
  const revision = pagos.some(p => p.validacion === 'REVISION');
  return { referencia: compra.referencia, estado: compra.estado,
    estado_temporal: compra.estado === 'PENDIENTE' && ctx.ahora >= fechaGuardada(compra.vence_en) ? 'VENCIDA' : compra.estado,
    total: compra.total, moneda: compra.moneda, vence_en: compra.vence_en,
    acceso_duracion_cantidad: item.acceso_duracion_cantidad, acceso_duracion_unidad: item.acceso_duracion_unidad,
    mercadopago_estado: compra.mp_preferencia_estado,
    pago_rechazado: pagos.some(p => p.estado === 'rejected'), pago_en_revision: revision,
    entregada: !!item.entregada_en, entregada_en: item.entregada_en,
    entrega_en_revision: compra.estado === 'PAGADA' && !item.entregada_en,
    acceso: vistaAcceso(ctx.acceso, ctx.ahora) };
}
export async function validarPagoAgenda(req, ctx) {
  camposPermitidos(req.body, [], { vacio: true });
  const { compra } = await compraPropiaAgenda(req.params.referencia, ctx.usuario.id, ctx.transaction);
  permisoComprable(ctx.acceso);
  await configuracion(ctx);
  return { referencia: compra.referencia };
}
export async function cancelarCompraAgenda(req, ctx) {
  camposPermitidos(req.body, [], { vacio: true });
  const { compra } = await compraPropiaAgenda(req.params.referencia, ctx.usuario.id, ctx.transaction);
  exigir(compra.estado === 'PENDIENTE' && compra.mp_preferencia_estado === 'SIN_CREAR',
    409, 'AGENDA_CANCELACION_REVISION', 'Un intento enviado debe verificarse antes de cancelar. No repitas el pago.');
  await compra.update({ estado: 'CANCELADA' }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_COMPRA_CANCELADA', 'compras', compra.id);
  return resumenCompraAgenda(req, ctx);
}

// Se ejecuta después de persistir el pago verificado, sin depender del navegador.
// El bloqueo de cuenta -> compra -> acceso coincide con las escrituras de la Agenda.
export async function entregarAgendaCompra(referencia) {
  const known = await m.compras.findOne({ where: { referencia } });
  const detail = known && await m.agenda_compras.findOne({ where: { compra_id: known.id } });
  if (!detail) return;
  return db.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
    const { user, cliente } = await bloquearUsuario(detail.usuario_id, transaction);
    const { compra, item } = await compraPropiaAgenda(referencia, user.id, transaction);
    if (item.entregada_en || compra.estado !== 'PAGADA') return;
    const now = await ahoraCompra(transaction);
    // Una incidencia no cambia la aprobación histórica ni concede permisos.
    const pagos = await m.compra_pagos.findAll({ where: { compra_id: compra.id }, transaction });
    if (pagos.some(p => p.validacion === 'REVISION') || !habilitarCuenta(user, cliente)) return;
    await exigirPago(compra, transaction);
    const acceso = await m.agenda_accesos.findOne({ where: { usuario_id: user.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (acceso && acceso.estado !== 'ACTIVO') return;
    const inicioAnterior = fechaGuardada(acceso?.inicio_en), finAnterior = fechaGuardada(acceso?.vence_en);
    const ilimitado = acceso && acceso.vence_en === null;
    const vencido = finAnterior && finAnterior <= now;
    const inicio = !acceso || vencido ? now : inicioAnterior;
    const base = new Date(Math.max(now.getTime(), inicioAnterior?.getTime() ?? 0, finAnterior?.getTime() ?? 0));
    const vence = ilimitado || item.acceso_duracion_unidad === 'SIN_VENCIMIENTO' ? null
      : vencimientoCompra(base, item.acceso_duracion_cantidad, item.acceso_duracion_unidad);
    if (vencido) {
      const abiertos = await m.agenda_tiempo_registros.findAll({ where: { usuario_id: user.id, en_curso: 1 }, transaction });
      for (const tramo of abiertos) {
        const fin = new Date(Math.max(fechaGuardada(tramo.inicio_en).getTime(), finAnterior.getTime()));
        await tramo.update({ fin_en: fin, en_curso: null, duracion_segundos: segundosRegistro(tramo, fin),
          version: siguienteVersion(tramo) }, { transaction });
      }
    }
    const accion = !acceso ? 'ASIGNADO' : ilimitado ? 'CONSERVADO' : 'RENOVADO';
    const values = { estado: 'ACTIVO', inicio_en: inicio, vence_en: vence, motivo: 'Compra online de Mi agenda',
      otorgado_por: user.id, version: acceso ? siguienteVersion(acceso) : 1 };
    const guardado = acceso ? (ilimitado ? acceso : await acceso.update(values, { transaction }))
      : await m.agenda_accesos.create({ ...values, usuario_id: user.id }, { transaction });
    await item.update({ entregada_en: now, acceso_id: guardado.id, accion, inicio_en: inicio, vence_en: vence }, { transaction });
    await m.auditoria_eventos.create({ usuario_id: user.id, accion: 'COMPRA_ENTREGADA', entidad: 'compras',
      entidad_id: compra.id, detalle: { producto: 'AGENDA', acceso_id: String(guardado.id), accion,
        inicio_en: inicio, vence_en: vence }, creado_en: now }, { transaction });
  });
}
