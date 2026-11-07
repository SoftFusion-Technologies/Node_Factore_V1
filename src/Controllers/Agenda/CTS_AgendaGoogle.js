/* Benjamin Orellana - 05/11/2026 - Vinculación privada y lectura de Google Calendar por día. */
import { modelos as m } from '../../Models/index.js';
import { entradaEventoGoogle, referenciaEventoGoogle, identidadEventoGoogle } from '../../Services/Agenda/agendaGoogleEventos.service.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import Conexion from '../../Models/Agenda/MD_TB_AgendaGoogleConexiones.js';
import { auditarAgenda, conAgenda, controladorAgenda } from '../../Services/Agenda/agendaAcceso.service.js';
import { fechaAgenda } from '../../Services/Agenda/agendaDatos.service.js';
import { abrirGoogle, autorizarGoogle, cifrarGoogle, credencialesGoogle, configGoogleAgenda, eventosGoogle, eventosGoogleMes, limitesMesGoogle, intercambiarGoogle, enviarEventoGoogle } from '../../Services/Agenda/agendaGoogleProveedor.service.js';
import { camposPermitidos, exigir } from '../../utils/validacion.utils.js';
import { igualSeguro } from '../../utils/password.utils.js';

const tabla = 'agenda_google_conexiones';
const digerir = (value, format = 'hex') => createHash('sha256').update(value).digest(format);
const consultaVacia = req => camposPermitidos(req.query, [], { vacio: true });
const cuerpoVacio = req => { consultaVacia(req); camposPermitidos(req.body, [], { vacio: true }); };
function buscar(ctx) {
  return Conexion.scope('conCredenciales').findOne({ where: { usuario_id: ctx.usuario.id },
    transaction: ctx.transaction, lock: ctx.transaction.LOCK.UPDATE });
}
function habilitada() {
  const config = configGoogleAgenda();
  exigir(config, 503, 'GOOGLE_AGENDA_CONFIG', 'Google Calendar todavía no está configurado.');
  return config;
}

export const CONECTAR_AgendaGoogle_CTS = controladorAgenda('POST', async (req, ctx) => {
  consultaVacia(req);
  camposPermitidos(req.body, ['escritura'], { vacio: true });
  exigir(req.body.escritura === undefined || typeof req.body.escritura === 'boolean', 422, 'DATOS_INVALIDOS', 'Revisá la solicitud.');
  const escritura = req.body.escritura === true;
  const config = habilitada();
  exigir(req.headers.origin === config.origin, 409, 'GOOGLE_AGENDA_ORIGEN', 'Abrí Mi agenda desde la dirección configurada para Google.');
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
  const intento = { hash: digerir(state), verifier, escritura, sesion: String(ctx.sesion.id), vence: ctx.ahora.getTime() + 600000 };
  const values = { intento_cifrado: cifrarGoogle(config, ctx.usuario.id, 'intento', JSON.stringify(intento)), revision: randomUUID() };
  const row = await buscar(ctx);
  if (row) await row.update(values, { transaction: ctx.transaction });
  else await Conexion.create({ ...values, usuario_id: ctx.usuario.id }, { transaction: ctx.transaction });
  return { data: { url: autorizarGoogle(config, state, digerir(verifier, 'base64url'), escritura) } };
});

export const RETORNO_AgendaGoogle_CTS = controladorAgenda('GET', async (req, ctx) => {
  const config = habilitada(), { state, code, error } = req.query;
  exigir(typeof state === 'string' && /^[A-Za-z0-9_-]{43}$/.test(state)
    && ((typeof code === 'string' && code.length > 0 && code.length <= 4096 && !/\s/.test(code) && error === undefined)
      || (typeof error === 'string' && error.length <= 100 && code === undefined)),
  403, 'GOOGLE_AGENDA_ESTADO', 'La solicitud de conexión no es válida. Volvé a Mi agenda.');
  const row = await buscar(ctx);
  exigir(row?.intento_cifrado, 403, 'GOOGLE_AGENDA_ESTADO', 'La solicitud de conexión ya no está disponible.');
  const intento = JSON.parse(abrirGoogle(config, ctx.usuario.id, 'intento', row.intento_cifrado));
  exigir(igualSeguro(intento.hash, digerir(state)) && intento.sesion === String(ctx.sesion.id) && intento.vence > ctx.ahora.getTime(),
    403, 'GOOGLE_AGENDA_ESTADO', 'La solicitud venció o pertenece a otra sesión. Volvé a conectar.');
  const revision = randomUUID();
  await row.update({ intento_cifrado: null, revision }, { transaction: ctx.transaction });
  return { config, revision, code, escritura: intento.escritura === true, verifier: intento.verifier,
    destino: config.origin + (ctx.usuario.rol === 'ADMIN' ? '/admin/agenda' : '/campus/agenda') };
}, { redirigir: true, despues: async (inicio, req) => {
  if (!inicio.code) return { destino: inicio.destino + '?google=cancelada' };
  let refresh;
  try { refresh = await intercambiarGoogle(inicio.config, inicio.code, inicio.verifier, inicio.escritura); }
  catch { return { destino: inicio.destino + '?google=error' }; }
  await conAgenda(req, async (_, ctx) => {
    const row = await buscar(ctx);
    exigir(row?.revision === inicio.revision, 409, 'GOOGLE_AGENDA_ESTADO', 'La conexión cambió. Volvé a Mi agenda.');
    await row.update({ refresh_cifrado: cifrarGoogle(inicio.config, ctx.usuario.id, 'refresh', refresh), revision: randomUUID() },
      { transaction: ctx.transaction });
    await auditarAgenda(ctx, 'AGENDA_GOOGLE_CONECTADO', tabla, row.id);
  });
  return { destino: inicio.destino + (inicio.escritura ? '?google=escritura' : '?google=conectada') };
} });

/* Benjamin Orellana - 07/11/2026 - Mes y día comparten las mismas validaciones y aislamiento. */
function lecturaGoogle(mensual) {
  return controladorAgenda('GET', async (req, ctx) => {
    consultaVacia(req);
    const fecha = mensual ? (limitesMesGoogle(req.params.mes), req.params.mes) : fechaAgenda(req.params.fecha);
    const config = configGoogleAgenda();
    if (!config) return { data: { disponible: false } };
    const row = await buscar(ctx), data = { disponible: true, origen: config.origin, conectada: Boolean(row?.refresh_cifrado), eventos: [] };
    if (!row?.refresh_cifrado) return { data };
    data.conexion_revision = row.revision;
    try {
      data.escritura_habilitada = credencialesGoogle(abrirGoogle(config, ctx.usuario.id, 'refresh', row.refresh_cifrado)).escritura;
    } catch (error) {
      if (error.code !== 'GOOGLE_AGENDA_RECONECTAR') throw error;
      return { data: { ...data, escritura_habilitada: false, reconectar: true } };
    }
    return { data, config, fecha, revision: row.revision, refresh: row.refresh_cifrado, usuario: ctx.usuario.id };
  }, { despues: async (inicio, req) => {
    if (!inicio.refresh) return { data: inicio.data };
    let eventos, aviso, reconectar = false;
    try { eventos = await (mensual ? eventosGoogleMes : eventosGoogle)(inicio.config, abrirGoogle(inicio.config, inicio.usuario, 'refresh', inicio.refresh), inicio.fecha); }
    catch (error) {
      if (error.code === 'GOOGLE_AGENDA_RECONECTAR') reconectar = true;
      else if (error.code === 'GOOGLE_AGENDA_CONEXION') aviso = error.message;
      else throw error;
    }
    // Revocar o desconectar durante una consulta impide devolver los eventos obtenidos.
    await conAgenda(req, async (_, ctx) => {
      const row = await buscar(ctx);
      exigir(row?.revision === inicio.revision, 409, 'GOOGLE_AGENDA_ESTADO', 'La conexión cambió. Actualizá Mi agenda.');
    });
    return { data: { ...inicio.data, eventos: eventos ?? [], reconectar, ...(aviso ? { aviso } : {}) } };
  } });
}
export const OBRS_AgendaGoogle_CTS = lecturaGoogle(false);
export const OBRS_MesAgendaGoogle_CTS = lecturaGoogle(true);

export const DESCONECTAR_AgendaGoogle_CTS = controladorAgenda('DELETE', async (req, ctx) => {
  cuerpoVacio(req);
  const row = await buscar(ctx);
  if (row) {
    await row.destroy({ transaction: ctx.transaction });
    await auditarAgenda(ctx, 'AGENDA_GOOGLE_DESCONECTADO', tabla, row.id);
  }
  return { data: { conectada: false } };
}, { permiso: false });


/* Benjamin Orellana - 07/11/2026 - Creación explícita con CSRF y comprobación del mismo intento sin duplicar. */
const eventosEnCurso = new Set();
function accionEventoGoogle(crear) {
  return controladorAgenda(crear ? 'POST' : 'GET', async (req, ctx) => {
    const entrada = crear ? (consultaVacia(req), entradaEventoGoogle(req.body)) : null;
    if (!crear) camposPermitidos(req.query, ['conexion_revision']);
    const referencia = entrada?.referencia ?? referenciaEventoGoogle(req.params.referencia);
    const revision = entrada?.conexion_revision ?? referenciaEventoGoogle(req.query.conexion_revision);
    const config = habilitada(), row = await buscar(ctx);
    exigir(row?.refresh_cifrado && row.revision === revision, 409, 'GOOGLE_AGENDA_ESTADO', 'La conexión cambió. Actualizá Mi agenda.');
    const refresh = abrirGoogle(config, ctx.usuario.id, 'refresh', row.refresh_cifrado);
    exigir(credencialesGoogle(refresh).escritura, 409, 'GOOGLE_AGENDA_ESCRITURA', 'Habilitá la creación de eventos en Google.');
    return { config, entrada, revision, refresh, usuario: ctx.usuario.id,
      identidad: identidadEventoGoogle(config, ctx.usuario.id, revision, referencia, entrada) };
  }, { despues: async (inicio, req) => {
    const clave = String(inicio.usuario) + ':' + inicio.revision + ':' + inicio.identidad.id;
    exigir(!eventosEnCurso.has(clave), 409, 'GOOGLE_EVENTO_EN_CURSO', 'Este evento ya se está enviando. Comprobá el mismo intento.');
    eventosEnCurso.add(clave);
    try {
      const comprobar = async () => conAgenda(req, async (_, ctx) => {
        const row = await buscar(ctx);
        exigir(row?.revision === inicio.revision, 409, 'GOOGLE_AGENDA_ESTADO', 'La conexión cambió. Actualizá Mi agenda.');
        return row;
      });
      const salida = await enviarEventoGoogle(inicio.config, inicio.refresh, inicio.identidad, inicio.entrada, comprobar);
      await conAgenda(req, async (_, ctx) => {
        const row = await buscar(ctx);
        exigir(row?.revision === inicio.revision, 409, 'GOOGLE_AGENDA_ESTADO', 'La conexión cambió. Actualizá Mi agenda.');
        if (salida.estado === 'CONFIRMADO') {
          const anteriores = await m.auditoria_eventos.findAll({ where: { usuario_id: ctx.usuario.id,
            entidad: tabla, entidad_id: row.id, accion: 'AGENDA_GOOGLE_EVENTO_CREADO' }, attributes: ['detalle'], transaction: ctx.transaction });
          if (!anteriores.some(a => a.detalle?.evento_id === salida.evento_id)) {
            await auditarAgenda(ctx, 'AGENDA_GOOGLE_EVENTO_CREADO', tabla, row.id, { evento_id: salida.evento_id });
          }
        }
      });
      return { data: salida };
    } finally {
      eventosEnCurso.delete(clave);
    }
  } });
}
export const CR_AgendaGoogleEvento_CTS = accionEventoGoogle(true);
export const OBRS_AgendaGoogleEvento_CTS = accionEventoGoogle(false);
