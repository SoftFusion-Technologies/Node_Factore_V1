/* Benjamin Orellana - 21/10/2026 - Prueba autenticada de Agenda sin modificar su contenido ni permisos. */
import { createInterface } from 'node:readline/promises';
import { passwordOculta } from '../src/utils/terminal.utils.js';
import { configServidor } from '../src/Services/Sistema/configServidor.service.js';
import { configAuth } from '../src/Services/Usuario/configAuth.service.js';

async function principal() {
  if (process.argv.length !== 2) throw new Error('Uso: node Scripts/probar-agenda-http.js');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Usar una terminal interactiva.');
  const config = configServidor();
  const host = ['::1', '::'].includes(config.host) ? '[::1]' : '127.0.0.1';
  const base = `http://${host}:${config.port}`;
  const origin = new URL(configAuth().front).origin;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let email;
  try { email = (await rl.question('Email: ')).trim(); } finally { rl.close(); }
  let password = await passwordOculta('Contraseña (entrada oculta): ');
  let jar, salida, fallo;
  async function enviar(path, method = 'GET', body) {
    let res;
    try {
      res = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(jar ? { cookie: jar.cookie, 'x-csrf-token': jar.csrf } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new Error('API_NO_DISPONIBLE: iniciar el backend en otra terminal.'); }
    if (!/^application\/json(?:\s*;|$)/i.test(res.headers.get('content-type') ?? '')) throw new Error('RESPUESTA_API_INVALIDA');
    const value = await res.json().catch(() => null);
    if (!res.ok) throw new Error(/^[A-Z][A-Z0-9_]{0,79}$/.test(value?.error?.code ?? '') ? value.error.code : 'HTTP_' + res.status);
    return { res, data: value?.data };
  }
  try {
    const login = await enviar('/api/auth/login', 'POST', { email, password });
    password = '';
    const raw = /(?:^|[, ]+)factore_sid=([A-Za-z0-9_-]{43})(?:;|$)/.exec(login.res.headers.get('set-cookie') ?? '');
    // Benjamin Orellana - 21/10/2026 - Cookie de 43 caracteres y CSRF SHA-256 hexadecimal de 64.
    if (!raw || !/^[a-f0-9]{64}$/.test(login.data?.csrf_token ?? '')) throw new Error('SESION_API_INVALIDA');
    jar = { cookie: 'factore_sid=' + raw[1], csrf: login.data.csrf_token };
    if (login.data.usuario?.cambiar_password !== 0) throw new Error('CAMBIAR_PASSWORD: ejecutar npm run auth:probar antes de continuar.');
    const { data: estado } = await enviar('/api/agenda/estado');
    if (!estado || typeof estado.habilitada !== 'boolean') throw new Error('RESPUESTA_AGENDA_INVALIDA');
    salida = { login: true, agenda_habilitada: estado.habilitada, estado_agenda: estado.estado_temporal };
    if (estado.habilitada) {
      const mes = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7);
      const { data: calendario } = await enviar('/api/agenda/mes?mes=' + mes);
      if (!Array.isArray(calendario?.dias) || !/^\d{4}-\d{2}-\d{2}$/.test(calendario.hoy)) throw new Error('RESPUESTA_AGENDA_INVALIDA');
      const { data: dia } = await enviar('/api/agenda/dias/' + calendario.hoy);
      if (!Array.isArray(dia?.tareas) || !Array.isArray(dia?.notas)) throw new Error('RESPUESTA_AGENDA_INVALIDA');
      Object.assign(salida, { mes_consultado: mes, dias_mes: calendario.dias.length,
        fecha_consultada: calendario.hoy, tareas: dia.tareas.length, notas: dia.notas.length });
    }
  } catch (error) { fallo = error; }
  finally {
    password = '';
    if (jar) {
      try { await enviar('/api/auth/logout', 'POST', {}); }
      catch { fallo ??= new Error('LOGOUT_NO_CONFIRMADO: la sesión de esta prueba puede seguir vigente.'); }
    }
  }
  if (fallo) throw fallo;
  console.log(JSON.stringify({ ...salida, logout: true }));
}
principal().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
