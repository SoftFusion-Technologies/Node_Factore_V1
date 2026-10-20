/* Benjamin Orellana - 19/10/2026 - Entrega transaccional de compras a una cuenta autenticada. */
import { Op, Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import { modelos } from '../../Models/index.js';
import { bloquearUsuario } from '../Usuario/usuarioEstado.service.js';
import { hashToken, tokenValido } from '../../utils/password.utils.js';
import { exigir } from '../../utils/validacion.utils.js';
import { ahoraCompra, autorizarCompra, identidadCompra } from './compra.service.js';
import { fechaGuardada } from '../Acceso/permisoAcceso.service.js';
import { validarOtorgamiento, guardarHistorial, snapshot } from '../Acceso/gestionAcceso.service.js';

// Calendario de Argentina (UTC-3): conservar hora y ajustar el último día de mes.
export function vencimientoCompra(inicio, cantidad, unidad) {
  exigir(inicio instanceof Date && Number.isFinite(inicio.getTime()) && Number.isInteger(cantidad) &&
    cantidad >= 1 && ((unidad === 'DIAS' && cantidad <= 3650) || (unidad === 'MESES' && cantidad <= 120)),
  409, 'COMPRA_DURACION_INVALIDA', 'La duración de la compra necesita revisión.');
  const local = new Date(inicio.getTime() - 3 * 3600000);
  if (unidad === 'DIAS') local.setUTCDate(local.getUTCDate() + cantidad);
  else {
    const dia = local.getUTCDate();
    local.setUTCDate(1); local.setUTCMonth(local.getUTCMonth() + cantidad);
    const ultimo = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
    local.setUTCDate(Math.min(dia, ultimo));
  }
  const fin = new Date(local.getTime() + 3 * 3600000);
  exigir(fin > inicio && fin.getUTCFullYear() <= 9999, 409, 'COMPRA_DURACION_INVALIDA', 'El vencimiento necesita revisión.');
  return fin;
}
function centavos(value) {
  exigir(typeof value === 'string' && /^\d+\.\d{2}$/.test(value), 409, 'COMPRA_PAGO_REVISION', 'El importe necesita revisión.');
  return BigInt(value.replace('.', ''));
}
export async function exigirPago(compra, transaction) {
  exigir(compra.estado === 'PAGADA' && compra.pagada_en, 409, 'COMPRA_NO_PAGADA', 'Esperar la confirmación del pago.');
  const pagos = await modelos.compra_pagos.findAll({ where: { compra_id: compra.id }, transaction, lock: transaction.LOCK.UPDATE });
  const aprobados = pagos.filter(pago => pago.estado === 'approved' && pago.validacion === 'VALIDADO');
  exigir(!pagos.some(pago => pago.validacion === 'REVISION') && aprobados.length === 1 &&
    aprobados[0].aprobado_en && aprobados[0].moneda === compra.moneda && compra.moneda === 'ARS' &&
    centavos(aprobados[0].importe) === centavos(compra.total) && centavos(aprobados[0].importe_reintegrado) === 0n,
  409, 'COMPRA_PAGO_REVISION', 'Factor E necesita revisar el pago antes de asignar el curso.');
}
async function recibo(compra, transaction, reutilizada) {
  const evento = await modelos.auditoria_eventos.findOne({ where: { entidad: 'compras', entidad_id: compra.id,
    accion: 'COMPRA_ENTREGADA', usuario_id: compra.usuario_id }, order: [['id', 'ASC']], transaction });
  exigir(evento, 409, 'COMPRA_ENTREGA_REVISION', 'La asignación de esta compra necesita revisión.');
  const detalle = typeof evento.detalle === 'string' ? JSON.parse(evento.detalle) : evento.detalle;
  return { referencia: compra.referencia, entregada: true, reutilizada, cursos: detalle.cursos };
}
export async function entregarCompra(req) {
  const tokenHash = identidadCompra(req.params.referencia, req.compraToken);
  exigir(req.user?.id && req.session?.id && tokenValido(req.sessionToken), 401, 'SESION_INVALIDA', 'Iniciar sesión para continuar.');
  return db.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
    // Mismo orden de bloqueo que la gestión: cliente -> usuario -> sesión -> compra -> cursos -> accesos.
    const { user, cliente } = await bloquearUsuario(req.user.id, transaction);
    exigir(user.estado === 'ACTIVO' && user.rol === 'ALUMNO' && user.cambiar_password === 0 && cliente?.activo === 1,
      403, 'COMPRA_CUENTA_INVALIDA', 'Ingresar con una cuenta de alumno habilitada.');
    const now = await ahoraCompra(transaction);
    const sesion = await modelos.usuarios_sesiones.findOne({ where: { id: req.session.id, usuario_id: user.id,
      token_hash: hashToken(req.sessionToken), revocada_en: null, vence_en: { [Op.gt]: now } },
    transaction, lock: transaction.LOCK.UPDATE });
    exigir(sesion, 401, 'SESION_INVALIDA', 'Iniciar sesión para continuar.');
    const compra = await modelos.compras.scope('conHash').findOne({ where: { referencia: req.params.referencia },
      transaction, lock: transaction.LOCK.UPDATE });
    autorizarCompra(compra, tokenHash);
    exigir(compra.usuario_id === null || String(compra.usuario_id) === String(user.id),
      409, 'COMPRA_ENTREGA_REVISION', 'La asignación de esta compra necesita revisión.');
    await exigirPago(compra, transaction);
    // Nunca volver a otorgar ni renovar, aunque la administración haya cambiado el acceso después.
    if (compra.usuario_id !== null) return recibo(compra, transaction, true);
    exigir(compra.comprador_email.toLowerCase() === user.email.toLowerCase(), 409, 'COMPRA_EMAIL_DISTINTO',
      'Ingresar con la cuenta que usa el email de la compra o contactar a Factor E.');
    const items = await modelos.compra_items.findAll({ where: { compra_id: compra.id }, order: [['curso_id', 'ASC']],
      transaction, lock: transaction.LOCK.UPDATE });
    exigir(items.length > 0 && items.length <= 50 && items.every(item => item.moneda === compra.moneda) &&
      items.reduce((total, item) => total + centavos(item.precio_unitario), 0n) === centavos(compra.total),
    409, 'COMPRA_ENTREGA_REVISION', 'El detalle de la compra necesita revisión.');
    const planes = [];
    // Todos los cursos primero: evitar invertir el orden al bloquear archivos compartidos entre cursos.
    for (const item of items) {
      const curso = await modelos.cursos.findByPk(item.curso_id, { transaction, lock: transaction.LOCK.UPDATE });
      exigir(curso?.estado === 'PUBLICADO', 409, 'COMPRA_CONTENIDO_REVISION', 'Factor E necesita revisar el contenido comprado.');
      planes.push({ item, curso });
    }
    for (const plan of planes) {
      const { item } = plan;
      const acceso = await modelos.curso_accesos.findOne({ where: { usuario_id: user.id, curso_id: item.curso_id },
        transaction, lock: transaction.LOCK.UPDATE });
      const excepciones = acceso ? await modelos.curso_acceso_lecciones.count({ where: { acceso_id: acceso.id }, transaction }) : 0;
      exigir(!acceso || (acceso.estado === 'ACTIVO' && acceso.alcance === 'COMPLETO' && excepciones === 0),
        409, 'COMPRA_ACCESO_REVISION', 'Factor E necesita revisar los permisos existentes antes de aplicar la compra.');
      // Si ya es ilimitado, conservarlo. Una renovación comienza al terminar el período vigente.
      const desde = acceso ? new Date(Math.max(now.getTime(), fechaGuardada(acceso.inicio_en).getTime(),
        fechaGuardada(acceso.vence_en)?.getTime() || 0)) : now;
      plan.acceso = acceso;
      plan.antes = acceso ? await snapshot(acceso, transaction, now) : null;
      plan.inicio = acceso ? fechaGuardada(acceso.inicio_en) : now;
      plan.vence = acceso && acceso.vence_en === null ? null :
        vencimientoCompra(desde, item.acceso_duracion_cantidad, item.acceso_duracion_unidad);
    }
    const cursos = [];
    for (const plan of planes) {
      const { item, curso } = plan;
      await validarOtorgamiento({ usuario: user, cliente, curso }, { estado: 'ACTIVO', alcance: 'COMPLETO',
        curso_id: item.curso_id, inicio_en: plan.inicio, vence_en: plan.vence }, [], now, transaction);
      let acceso = plan.acceso, accion = 'CONSERVADO';
      if (!acceso) {
        acceso = await modelos.curso_accesos.create({ usuario_id: user.id, curso_id: item.curso_id,
          estado: 'ACTIVO', alcance: 'COMPLETO', inicio_en: plan.inicio, vence_en: plan.vence,
          asignado_por: user.id, creado_en: now, actualizado_en: now }, { transaction });
        accion = 'ASIGNADO';
      } else if (plan.vence !== null) {
        await acceso.update({ vence_en: plan.vence, actualizado_en: now }, { transaction });
        accion = 'RENOVADO';
      }
      if (accion !== 'CONSERVADO') await guardarHistorial(acceso, user, accion, plan.antes,
        await snapshot(acceso, transaction, now), 'Compra online ' + compra.referencia, transaction);
      cursos.push({ curso_id: String(item.curso_id), acceso_id: String(acceso.id), accion,
        inicio_en: plan.inicio.toISOString(), vence_en: plan.vence?.toISOString() ?? null });
    }
    await compra.update({ usuario_id: user.id, actualizado_en: now }, { transaction });
    await modelos.auditoria_eventos.create({ usuario_id: user.id, accion: 'COMPRA_ENTREGADA', entidad: 'compras',
      entidad_id: compra.id, detalle: { origen: 'COMPRA_ONLINE', cursos }, creado_en: now }, { transaction });
    return { referencia: compra.referencia, entregada: true, reutilizada: false, cursos };
  });
}
