/* Benjamin Orellana - 05/11/2026 - OAuth y lectura acotada del calendario principal, sin guardar eventos. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { configAuth } from '../Usuario/configAuth.service.js';
import { ErrorHttp, exigir } from '../../utils/validacion.utils.js';
import { fechaAgenda } from './agendaDatos.service.js';

export const scopeEscrituraGoogleAgenda = 'https://www.googleapis.com/auth/calendar.events.owned';
export const scopeGoogleAgenda = 'https://www.googleapis.com/auth/calendar.events.owned.readonly';
const callback = '/api/agenda/google/callback';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const zona = 'America/Argentina/Buenos_Aires';
export function configGoogleAgenda() {
  if (process.env.GOOGLE_AGENDA_HABILITADO !== 'true') return null;
  const { origins, front, sameSite } = configAuth();
  const origin = process.env.GOOGLE_AGENDA_ORIGEN || new URL(front).origin;
  let url;
  try { url = new URL(origin); } catch { /* Error de configuración seguro abajo. */ }
  const clientId = process.env.GOOGLE_AGENDA_CLIENT_ID, secret = process.env.GOOGLE_AGENDA_CLIENT_SECRET;
  const key = process.env.GOOGLE_AGENDA_CLAVE_CIFRADO;
  const local = ['development', 'test'].includes(process.env.NODE_ENV) && ['localhost', '127.0.0.1'].includes(url?.hostname);
  exigir(url && origin === url.origin && origins.includes(origin) && (url.protocol === 'https:' || (local && url.protocol === 'http:'))
    && sameSite !== 'strict' && /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId || '')
    && typeof secret === 'string' && secret.length >= 10 && !/\s/.test(secret)
    && /^[0-9a-f]{64}$/i.test(key || ''), 503, 'GOOGLE_AGENDA_CONFIG', 'Google Calendar todavía no está configurado.');
  return { origin, clientId, secret, key: Buffer.from(key, 'hex'), redirect: origin + callback };
}
export function cifrarGoogle(config, usuario, finalidad, value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', config.key, iv);
  cipher.setAAD(Buffer.from(`factor-e:agenda-google:v1:${usuario}:${finalidad}`));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function abrirGoogle(config, usuario, finalidad, value) {
  try {
    const data = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', config.key, data.subarray(0, 12));
    cipher.setAAD(Buffer.from(`factor-e:agenda-google:v1:${usuario}:${finalidad}`));
    cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
  } catch {
    throw new ErrorHttp(409, 'GOOGLE_AGENDA_RECONECTAR', 'Volvé a conectar tu calendario de Google.');
  }
}
export function autorizarGoogle(config, state, challenge, escritura = false) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect,
    response_type: 'code', scope: escritura ? scopeGoogleAgenda + ' ' + scopeEscrituraGoogleAgenda : scopeGoogleAgenda,
    include_granted_scopes: 'true', access_type: 'offline', prompt: 'consent select_account',
    state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return url.href;
}
async function pedir(url, options) {
  let res, data;
  try {
    res = await fetch(url, { ...options, redirect: 'error' });
    data = await res.json();
  } catch {
    throw new ErrorHttp(502, 'GOOGLE_AGENDA_CONEXION', 'No se pudo consultar Google Calendar.');
  }
  if ((url === tokenUrl && data?.error === 'invalid_grant') || res.status === 401) {
    throw new ErrorHttp(409, 'GOOGLE_AGENDA_RECONECTAR', 'Volvé a conectar tu calendario de Google.');
  }
  exigir(res.ok && data && typeof data === 'object' && !Array.isArray(data),
    502, 'GOOGLE_AGENDA_CONEXION', 'No se pudo consultar Google Calendar.');
  return data;
}
function pedirToken(config, parametros, signal) {
  return pedir(tokenUrl, { method: 'POST', signal, body: new URLSearchParams({
    client_id: config.clientId, client_secret: config.secret, ...parametros
  }) });
}
const tokenValido = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/\s/.test(value);
export async function intercambiarGoogle(config, code, verifier, escritura = false) {
  const token = await pedirToken(config, { grant_type: 'authorization_code', code,
    redirect_uri: config.redirect, code_verifier: verifier }, AbortSignal.timeout(8500));
  exigir(tokenValido(token.refresh_token) && (token.scope === undefined ||
    (typeof token.scope === 'string' && token.scope.split(/\s+/).some(s => [scopeGoogleAgenda, scopeEscrituraGoogleAgenda].includes(s)))),
  409, 'GOOGLE_AGENDA_RECONECTAR', 'Autorizá la lectura de tu calendario para continuar.');
  exigir(!escritura || (typeof token.scope === 'string' && token.scope.split(/\s+/).includes(scopeEscrituraGoogleAgenda)),
    409, 'GOOGLE_AGENDA_ESCRITURA', 'Autorizá la creación de eventos para usar esta opción.');
  return JSON.stringify({ refresh: token.refresh_token, escritura });
}
/* Benjamin Orellana - 07/11/2026 - Credenciales anteriores continúan siendo de lectura. */
export function credencialesGoogle(value) {
  try {
    const data = JSON.parse(value);
    exigir(data && tokenValido(data.refresh) && typeof data.escritura === 'boolean',
      409, 'GOOGLE_AGENDA_RECONECTAR', 'Volvé a conectar tu calendario de Google.');
    return data;
  } catch (error) {
    if (error.code) throw error;
    exigir(tokenValido(value), 409, 'GOOGLE_AGENDA_RECONECTAR', 'Volvé a conectar tu calendario de Google.');
    return { refresh: value, escritura: false };
  }
}
function enlace(value, permitido) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && permitido(url)) return url.href;
  } catch { /* Sin enlace permitido. */ }
  return null;
}
const enlaceMeet = value => enlace(value, u => u.hostname === 'meet.google.com');
const enlaceCalendar = value => enlace(value, u => u.hostname === 'calendar.google.com' ||
  (u.hostname === 'www.google.com' && u.pathname.startsWith('/calendar/')));
const fechaCorta = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
function presentar(evento, desde, hasta, min, max) {
  if (!evento || evento.status === 'cancelled' || typeof evento.id !== 'string') return null;
  const dia = fechaCorta(evento.start?.date) && fechaCorta(evento.end?.date);
  const inicio = dia ? evento.start.date : evento.start?.dateTime;
  const fin = dia ? evento.end.date : evento.end?.dateTime;
  if (dia ? !(inicio < hasta && desde < fin) : !(Date.parse(inicio) < Date.parse(fin) && Date.parse(inicio) < max && Date.parse(fin) > min)) return null;
  const video = Array.isArray(evento.conferenceData?.entryPoints) ? evento.conferenceData.entryPoints.find(x => x?.entryPointType === 'video') : null;
  return { id: evento.id, titulo: typeof evento.summary === 'string' && evento.summary.trim() ? evento.summary.trim().slice(0, 500) : 'Evento sin título',
    todo_el_dia: dia, inicio, fin, meet: enlaceMeet(evento.hangoutLink) || enlaceMeet(video?.uri), url: enlaceCalendar(evento.htmlLink) };
}
/* Benjamin Orellana - 07/11/2026 - Una consulta paginada por mes; límites argentinos y fin exclusivo. */
export function limitesMesGoogle(mes) {
  exigir(typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes), 422, 'DATOS_INVALIDOS', 'Elegí un mes válido.');
  fechaAgenda(mes + '-01');
  const desde = mes + '-01', min = Date.parse(desde + 'T00:00:00-03:00');
  const siguiente = new Date(min);
  siguiente.setUTCMonth(siguiente.getUTCMonth() + 1);
  return { desde, hasta: siguiente.toISOString().slice(0, 10), min, max: siguiente.getTime() };
}
export function eventosGoogle(config, refresh, fecha) {
  fechaAgenda(fecha);
  const min = Date.parse(fecha + 'T00:00:00-03:00'), max = min + 86400000;
  return consultarEventos(config, refresh, { desde: fecha, hasta: new Date(max).toISOString().slice(0, 10), min, max });
}
export function eventosGoogleMes(config, refresh, mes) {
  return consultarEventos(config, refresh, limitesMesGoogle(mes));
}
async function consultarEventos(config, refresh, { desde, hasta, min, max }) {
  const signal = AbortSignal.timeout(8500);
  const token = await pedirToken(config, { grant_type: 'refresh_token', refresh_token: credencialesGoogle(refresh).refresh }, signal);
  exigir(tokenValido(token.access_token), 502, 'GOOGLE_AGENDA_CONEXION', 'No se pudo consultar Google Calendar.');
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.search = new URLSearchParams({ timeMin: new Date(min).toISOString(), timeMax: new Date(max).toISOString(),
    timeZone: zona, singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '250',
    fields: 'nextPageToken,items(id,summary,status,start,end,htmlLink,hangoutLink,conferenceData(entryPoints(entryPointType,uri)))' }).toString();
  const eventos = new Map();
  for (let pagina = 0; pagina < 10; pagina++) {
    const data = await pedir(url.href, { signal, headers: { Authorization: 'Bearer ' + token.access_token } });
    exigir(Array.isArray(data.items ?? []), 502, 'GOOGLE_AGENDA_CONEXION', 'No se pudo leer el calendario.');
    for (const e of data.items ?? []) {
      const evento = presentar(e, desde, hasta, min, max);
      if (evento) eventos.set(evento.id, evento);
    }
    if (!data.nextPageToken) return [...eventos.values()];
    exigir(typeof data.nextPageToken === 'string' && data.nextPageToken.length < 8192, 502, 'GOOGLE_AGENDA_CONEXION', 'No se pudo leer el calendario.');
    url.searchParams.set('pageToken', data.nextPageToken);
  }
  throw new ErrorHttp(502, 'GOOGLE_AGENDA_CONEXION', 'El calendario tiene demasiados eventos para este período.');
}

/* Benjamin Orellana - 07/11/2026 - GET antes de insertar y mismo ID en reintentos; nunca se modifican eventos existentes. */
const camposEvento = 'id,status,htmlLink,extendedProperties(private)';
async function respuestaEvento(url, options) {
  try {
    const respuesta = await fetch(url, { ...options, redirect: 'error' });
    const data = await respuesta.json().catch(() => null);
    return { http: respuesta.status, data };
  } catch {
    throw new ErrorHttp(502, 'GOOGLE_EVENTO_PENDIENTE', 'No pudimos confirmar el envío. Comprobá el mismo intento antes de crear otro.');
  }
}
function confirmacionEvento(respuesta, identidad) {
  if ([404, 410].includes(respuesta.http)) return null;
  exigir(respuesta.http >= 200 && respuesta.http < 300 && respuesta.data?.id === identidad.id,
    502, 'GOOGLE_EVENTO_PENDIENTE', 'No pudimos confirmar el evento. Comprobá el mismo intento.');
  const dato = respuesta.data;
  if (dato.status === 'cancelled') return { estado: 'ELIMINADO', evento_id: identidad.id };
  exigir(dato.extendedProperties?.private?.factoreOrigen === identidad.id
    && (!identidad.huella || dato.extendedProperties.private.factoreSolicitud === identidad.huella),
  409, 'GOOGLE_EVENTO_REFERENCIA', 'Este intento corresponde a otros datos. Actualizá el estado del evento.');
  return { estado: 'CONFIRMADO', evento_id: identidad.id, url: enlaceCalendar(dato.htmlLink) };
}
export async function enviarEventoGoogle(config, cifradoAbierto, identidad, entrada, revalidar) {
  const credenciales = credencialesGoogle(cifradoAbierto);
  exigir(credenciales.escritura, 409, 'GOOGLE_AGENDA_ESCRITURA', 'Habilitá la creación de eventos en Google.');
  const signal = AbortSignal.timeout(8500);
  const token = await pedirToken(config, { grant_type: 'refresh_token', refresh_token: credenciales.refresh }, signal);
  exigir(tokenValido(token.access_token), 502, 'GOOGLE_EVENTO_PENDIENTE', 'No pudimos confirmar el evento.');
  if (typeof token.scope === 'string') exigir(token.scope.split(/\s+/).includes(scopeEscrituraGoogleAgenda),
    409, 'GOOGLE_AGENDA_ESCRITURA', 'Volvé a autorizar la creación de eventos.');
  const headers = { Authorization: 'Bearer ' + token.access_token };
  const detalle = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + identidad.id);
  detalle.searchParams.set('fields', camposEvento);
  const existente = await respuestaEvento(detalle.href, { signal, headers });
  if (existente.http === 410) return { estado: 'ELIMINADO', evento_id: identidad.id };
  if (existente.http !== 404) return confirmacionEvento(existente, identidad);
  if (!entrada) return { estado: 'SIN_CONFIRMAR' };
  await revalidar();
  const tipoFecha = value => entrada.todo_el_dia ? { date: value } : { dateTime: value, timeZone: zona };
  const crear = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  crear.searchParams.set('sendUpdates', 'none');
  crear.searchParams.set('fields', camposEvento);
  const respuesta = await respuestaEvento(crear.href, { method: 'POST', signal,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: identidad.id, summary: entrada.titulo,
      start: tipoFecha(entrada.inicio), end: tipoFecha(entrada.fin),
      extendedProperties: { private: { factoreOrigen: identidad.id, factoreSolicitud: identidad.huella } } }) });
  if (respuesta.http === 409) {
    const confirmado = confirmacionEvento(await respuestaEvento(detalle.href, { signal, headers }), identidad);
    exigir(confirmado, 502, 'GOOGLE_EVENTO_PENDIENTE', 'Comprobá el mismo intento antes de crear otro evento.');
    return confirmado;
  }
  if ([400, 401, 403, 404].includes(respuesta.http)) throw new ErrorHttp(409, 'GOOGLE_EVENTO_RECHAZADO',
    'Google no aceptó el evento. Revisá los datos o volvé a autorizar la creación.');
  const confirmado = confirmacionEvento(respuesta, identidad);
  exigir(confirmado, 502, 'GOOGLE_EVENTO_PENDIENTE', 'Comprobá el mismo intento antes de crear otro evento.');
  return confirmado;
}
