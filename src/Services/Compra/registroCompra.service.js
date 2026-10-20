/* Benjamin Orellana - 18/10/2026 - Registro desde una compra pagada, sin apropiarse de cuentas existentes. */
import { Op, Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import { modelos } from '../../Models/index.js';
import { ahoraCompra, autorizarCompra, identidadCompra } from './compra.service.js';
import { exigirPago } from './entregaCompra.service.js';
import { bloquearUsuario } from '../Usuario/usuarioEstado.service.js';
import { emitirToken } from '../Usuario/auth.service.js';
import { configCorreoCuenta, enviarCorreoCuenta } from '../Usuario/correoCuenta.service.js';
import { exigir, id } from '../../utils/validacion.utils.js';
import { fechaGuardada } from '../Acceso/permisoAcceso.service.js';

const entidad = 'compras';
const accionCreada = 'COMPRA_CUENTA_CREADA', accionSolicitud = 'COMPRA_CORREO_SOLICITADO';
function cuentaCreada(evento) {
  const detalle = typeof evento.detalle === 'string' ? JSON.parse(evento.detalle) : evento.detalle;
  return id(detalle?.usuario_creado_id);
}
function whereEvento(compraId, accion) { return { entidad, entidad_id: compraId, accion }; }
async function auditar(compra, accion, usuarioId, transaction, detalle = null) {
  return modelos.auditoria_eventos.create({ ...whereEvento(compra.id, accion), usuario_id: usuarioId, detalle }, { transaction });
}
export async function solicitarCuentaCompra(req) {
  const tokenHash = identidadCompra(req.params.referencia, req.compraToken), config = configCorreoCuenta();
  const candidate = await modelos.compras.scope('conHash').findOne({ where: { referencia: req.params.referencia } });
  autorizarCompra(candidate, tokenHash);
  // La auditoría fija qué cuenta se creó por ESTA compra; coincidir por email no da permiso para regenerar enlaces ajenos.
  const creada = await modelos.auditoria_eventos.findOne({ where: whereEvento(candidate.id, accionCreada), order: [['id', 'ASC']] });
  let solicitud;
  try {
    solicitud = await db.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
      const propia = creada ? await bloquearUsuario(cuentaCreada(creada), transaction) : null;
      const compra = await modelos.compras.scope('conHash').findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
      autorizarCompra(compra, tokenHash); await exigirPago(compra, transaction);
      if (compra.usuario_id !== null) return null;
      const now = await ahoraCompra(transaction);
      const recent = await modelos.auditoria_eventos.findOne({ where: whereEvento(compra.id, accionSolicitud),
        order: [['id', 'DESC']], transaction });
      // Una respuesta perdida y el doble clic devuelven el mismo acuse; no vuelven a emitir un token.
      if (recent && now - fechaGuardada(recent.creado_en) < 60000) return null;
      const count = await modelos.auditoria_eventos.count({ where: { ...whereEvento(compra.id, accionSolicitud),
        creado_en: { [Op.gt]: new Date(now.getTime() - 86400000) } }, transaction });
      exigir(count < 5, 429, 'CORREO_LIMITE', 'Ya se solicitaron varios correos. Contactá a Factor E.');
      const ownEvent = await modelos.auditoria_eventos.findOne({ where: whereEvento(compra.id, accionCreada), transaction });
      // Otra solicitud creó la cuenta mientras esperábamos: se recuperará con el orden de bloqueo correcto al reintentar.
      if (ownEvent && !propia) return null;
      let user = propia?.user || await modelos.usuarios.findOne({ where: { email: compra.comprador_email }, transaction });
      let nuevo = false;
      if (!user) {
        const cliente = await modelos.crm_clientes.create({ nombre: compra.comprador_nombre,
          email: compra.comprador_email, tipo: 'PERSONA', estado_comercial: 'CLIENTE', activo: 1 }, { transaction });
        user = await modelos.usuarios.create({ cliente_id: cliente.id, nombre: compra.comprador_nombre,
          email: compra.comprador_email, rol: 'ALUMNO', estado: 'PENDIENTE', password_hash: null, cambiar_password: 0 }, { transaction });
        await auditar(compra, accionCreada, null, transaction, { origen: 'COMPRA_ONLINE',
          usuario_creado_id: String(user.id), cliente_creado_id: String(cliente.id) }); nuevo = true;
      }
      const puedeActivar = (nuevo || (propia && String(propia.user.id) === cuentaCreada(ownEvent))) &&
        user.rol === 'ALUMNO' && user.estado === 'PENDIENTE' && user.email === compra.comprador_email &&
        (nuevo || propia.cliente?.activo === 1) && compra.usuario_id === null;
      let enlace = config.front + '/login';
      if (puedeActivar) {
        const token = await emitirToken(user, transaction, 'ACTIVACION');
        const url = new URL(token.enlace); url.searchParams.set('compra', compra.referencia); enlace = url.href;
      }
      const evento = await auditar(compra, accionSolicitud, null, transaction);
      return { id: evento.id, compra, enlace, activacion: !!puedeActivar, destinatario: compra.comprador_email };
    });
  } catch (error) {
    // Dos compras del mismo email pueden llegar juntas. El índice único decide; nunca crear una segunda cuenta ni cambiar la existente.
    if (error.name === 'SequelizeUniqueConstraintError' || error.original?.code === 'ER_DUP_ENTRY') return { solicitud_recibida: true };
    throw error;
  }
  if (solicitud) {
    // No mantener bloqueos de MySQL durante una conexión SMTP. El token se guarda solo como hash.
    await enviarCorreoCuenta(solicitud, config);
    await modelos.auditoria_eventos.create({ ...whereEvento(solicitud.compra.id, 'COMPRA_CORREO_ACEPTADO'),
      usuario_id: null, detalle: { solicitud_id: String(solicitud.id) } });
  }
  return { solicitud_recibida: true };
}
