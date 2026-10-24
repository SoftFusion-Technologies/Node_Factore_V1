/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 20/10/2026 - Permiso individual y transacciones autenticadas de Mi agenda. */
import { Op, Transaction, literal } from 'sequelize';
import db from '../../DataBase/db.js';
import { modelos as m } from '../../Models/index.js';
import { initRelaciones } from '../../Models/relaciones.js';
import { sesionActual } from '../Usuario/auth.service.js';
import { bloquearUsuario } from '../Usuario/usuarioEstado.service.js';
import { cookieSesion, exigirJson } from '../Usuario/configAuth.service.js';
import { hashToken } from '../../utils/password.utils.js';
import { serializar, responderError } from '../../utils/http.utils.js';
import { camposPermitidos, exigir, id, opcion, texto } from '../../utils/validacion.utils.js';
import { ahoraDB, estadoTemporal, fechaGuardada, fechaUTC, validarVentana } from '../Acceso/permisoAcceso.service.js';
import { comprobarVersion, entradaAgenda, siguienteVersion, segundosRegistro } from './agendaDatos.service.js';

initRelaciones();

function exigirCuenta(user, cliente) {
  exigir(user?.estado === 'ACTIVO' && user.cambiar_password === 0
    && (user.rol === 'ADMIN' || (user.rol === 'ALUMNO' && cliente?.activo === 1)),
  401, 'SESION_INVALIDA', 'La cuenta no está habilitada.');
}
async function revalidarSesion(ctx) {
  const actual = await m.usuarios_sesiones.scope('conHash').findOne({
    where: { id: ctx.sesion.id, usuario_id: ctx.usuario.id, token_hash: hashToken(ctx.req.sessionToken),
      revocada_en: null, vence_en: { [Op.gt]: literal('UTC_TIMESTAMP(3)') } },
    attributes: ['id'], transaction: ctx.transaction, lock: ctx.transaction.LOCK.SHARE
  });
  exigir(actual, 401, 'SESION_INVALIDA', 'Iniciar sesión para continuar.');
}
export function vistaAcceso(row, ahora, admin = false) {
  const temporal = row ? estadoTemporal(row, ahora) : 'SIN_ACCESO';
  const result = { habilitada: temporal === 'ACTIVO', estado_temporal: temporal,
    inicio_en: row?.inicio_en ?? null, vence_en: row?.vence_en ?? null, version: row?.version ?? 0 };
  if (admin && row) Object.assign(result, { id: String(row.id), usuario_id: String(row.usuario_id),
    estado: row.estado, otorgado_por: row.otorgado_por == null ? null : String(row.otorgado_por),
    motivo: row.motivo, creado_en: row.creado_en, actualizado_en: row.actualizado_en });
  return result;
}
function exigirPermiso(ctx, ahora) {
  exigir(ctx.acceso && estadoTemporal(ctx.acceso, ahora) === 'ACTIVO', 403, 'AGENDA_NO_HABILITADA',
    'Tu acceso a Mi agenda no está habilitado o dejó de estar vigente.');
}
export function controladorAgenda(metodo, operation, { admin = false, permiso = true, despues } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      exigir(req.method === metodo, 405, 'METODO_INVALIDO', `Usar ${metodo} para esta operación.`);
      // El controlador se protege también si se prueba directamente, sin middleware.
      const sesion = await sesionActual(req);
      if (metodo !== 'GET') {
        exigir(req.headers?.origin !== undefined, 403, 'ORIGEN_REQUERIDO', 'La escritura requiere un origen permitido.');
        exigirJson(req);
      }
      const result = await db.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
        const { user, cliente } = await bloquearUsuario(sesion.usuario.id, transaction);
        exigirCuenta(user, cliente);
        if (admin) exigir(user.rol === 'ADMIN', 403, 'NO_AUTORIZADO', 'Esta operación requiere administrador.');
        const ctx = { req, sesion, usuario: user, transaction, ahora: await ahoraDB(transaction) };
        await revalidarSesion(ctx);
        if (!admin) {
          ctx.acceso = await m.agenda_accesos.findOne({ where: { usuario_id: user.id }, transaction, lock: transaction.LOCK.UPDATE });
          if (permiso) exigirPermiso(ctx, ctx.ahora);
        }
        const salida = await operation(req, ctx);
        await revalidarSesion(ctx);
        // Una sesión o ventana vencida durante el trabajo no confirma cambios.
        if (!admin && permiso) {
          ctx.acceso = await m.agenda_accesos.findOne({ where: { usuario_id: user.id }, transaction, lock: transaction.LOCK.UPDATE });
          exigirPermiso(ctx, await ahoraDB(transaction));
        }
        return salida;
      });
      const salida = despues ? await despues(result, req) : result;
      const { status = 200, ...body } = salida;
      return res.status(status).json(serializar(body));
    } catch (error) {
      if (error.status === 401) cookieSesion(res);
      return responderError(error, res);
    }
  };
}
export async function auditarAgenda(ctx, accion, entidad, entidadId, detalle = null) {
  // Solo IDs, versiones y campos modificados; nunca textos personales de Agenda.
  await m.auditoria_eventos.create({ usuario_id: ctx.usuario.id, accion, entidad, entidad_id: entidadId, detalle },
    { transaction: ctx.transaction });
}

async function destinoAcceso(req, ctx) {
  const key = id(req.params?.usuario_id, 'usuario_id');
  const { user, cliente } = await bloquearUsuario(key, ctx.transaction);
  const row = await m.agenda_accesos.findOne({ where: { usuario_id: key }, transaction: ctx.transaction,
    lock: ctx.transaction.LOCK.UPDATE });
  return { user, cliente, row };
}
export async function obtenerAccesoAgenda(req, ctx) {
  camposPermitidos(req.query, [], { vacio: true });
  const { user, row } = await destinoAcceso(req, ctx);
  return { usuario_id: String(user.id), ...vistaAcceso(row, ctx.ahora, true) };
}
export async function guardarAccesoAgenda(req, ctx) {
  const body = entradaAgenda(req, ['estado', 'inicio_en', 'vence_en', 'motivo'], { version: true, inicial: true });
  const estado = opcion(body.estado, 'estado', ['ACTIVO', 'SUSPENDIDO', 'REVOCADO']);
  const motivo = texto(body.motivo, 'motivo', 500);
  const { user, cliente, row } = await destinoAcceso(req, ctx);
  if (estado === 'ACTIVO') exigir(user.estado === 'ACTIVO' && (user.rol === 'ADMIN' || cliente?.activo === 1),
    409, 'AGENDA_CUENTA_NO_HABILITADA', 'La cuenta de destino debe estar activa.');
  comprobarVersion(row, body.version);
  const estadoAnterior = row?.estado ?? null;
  const data = { estado, motivo, otorgado_por: ctx.usuario.id,
    inicio_en: body.inicio_en === undefined ? (fechaGuardada(row?.inicio_en) ?? ctx.ahora) : fechaUTC(body.inicio_en, 'inicio_en'),
    vence_en: body.vence_en === undefined ? fechaGuardada(row?.vence_en) : fechaUTC(body.vence_en, 'vence_en', true),
    version: row ? siguienteVersion(row) : 1 };
  validarVentana(data);
  // Al cambiar un permiso se cierran sus tramos previos; nunca se cuenta tiempo
  // posterior al vencimiento. El contenido y el progreso personal se conservan.
  const abiertos = await m.agenda_tiempo_registros.findAll({ where: { usuario_id: user.id, en_curso: 1 },
    transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE });
  for (const registro of abiertos) {
    const limite = Math.min(ctx.ahora.getTime(), fechaGuardada(row?.vence_en)?.getTime() ?? Infinity);
    const fin = new Date(Math.max(fechaGuardada(registro.inicio_en).getTime(), limite));
    await registro.update({ fin_en: fin, en_curso: null,
      duracion_segundos: segundosRegistro(registro, fin), version: siguienteVersion(registro) }, { transaction: ctx.transaction });
  }
  const guardado = row ? await row.update(data, { transaction: ctx.transaction })
    : await m.agenda_accesos.create({ ...data, usuario_id: user.id }, { transaction: ctx.transaction });
  await auditarAgenda(ctx, row ? 'AGENDA_ACCESO_ACTUALIZADO' : 'AGENDA_ACCESO_CREADO', 'agenda_accesos', guardado.id,
    { usuario_id: String(user.id), estado_anterior: estadoAnterior,
      estado_nuevo: estado, registros_cerrados: abiertos.length, version: data.version });
  await guardado.reload({ transaction: ctx.transaction });
  return { usuario_id: String(user.id), ...vistaAcceso(guardado, ctx.ahora, true) };
}
