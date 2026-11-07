/* Benjamin Orellana - 05/11/2026 - HTTP y persistencia real aislada; Google simulado, sin credenciales reales. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { QueryTypes } from 'sequelize';

const origen = 'http://127.0.0.1:5173';
Object.assign(process.env, { NODE_ENV: 'test', DB_PASSWORD: 'Fixture Agenda Google', FRONTEND_URL: origen,
  ALLOWED_ORIGINS: origen + ',http://localhost:5173', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax',
  TRUST_PROXY: 'false', MP_HABILITADO: 'false', CORREO_HABILITADO: 'false', GOOGLE_AGENDA_HABILITADO: 'true',
  GOOGLE_AGENDA_ORIGEN: origen, GOOGLE_AGENDA_CLIENT_ID: 'fixture.apps.googleusercontent.com',
  GOOGLE_AGENDA_CLIENT_SECRET: 'fixture-solo-pruebas', GOOGLE_AGENDA_CLAVE_CIFRADO: 'de'.repeat(32) });
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { hashPassword } = await import('../src/utils/password.utils.js');
const { scopeGoogleAgenda } = await import('../src/Services/Agenda/agendaGoogleProveedor.service.js');

test('Agenda Google: consentimiento propio, permisos, eventos y desconexión en rutas reales', async t => {
  const adapter = await conectarPrueba(db, { extras: ['agenda.sqlite.sql', 'agenda-google.sqlite.sql'] });
  await t.test('La migración de Google solo añade el vínculo y conserva las columnas del modelo', async () => {
    const mysql = await readFile(new URL('../docs/sql/AGENDA_GOOGLE_ETAPA1.sql', import.meta.url), 'utf8');
    const sqlite = await db.query('PRAGMA table_info(agenda_google_conexiones)', { type: QueryTypes.SELECT });
    const campos = Object.keys(m.agenda_google_conexiones.rawAttributes);
    assert.deepEqual(sqlite.map(c => c.name), campos);
    assert.deepEqual([...mysql.matchAll(/^  (\w+) (?:BIGINT|TEXT|CHAR|DATETIME)\b/gm)].map(m => m[1]), campos);
    assert.match(mysql, /UNIQUE KEY \w+ \(usuario_id\)/);
    assert.match(mysql, /REFERENCES usuarios \(id\)\s+ON DELETE CASCADE/);
  });
  const password = 'Fixture OAuth Google 2026!', password_hash = await hashPassword(password);
  async function cuenta(nombre, acceso) {
    const cliente = await m.crm_clientes.create({ nombre });
    const user = await m.usuarios.create({ nombre, cliente_id: cliente.id, email: nombre + '@calendar.invalid', rol: 'ALUMNO', estado: 'ACTIVO', password_hash });
    if (acceso) await m.agenda_accesos.create({ usuario_id: user.id, estado: 'ACTIVO', inicio_en: '2020-01-01T00:00:00Z', motivo: 'Fixture' });
    return user;
  }
  const ana = await cuenta('ana', true), luz = await cuenta('luz', true), sinAgenda = await cuenta('sinagenda', false);
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port, original = globalThis.fetch;
  t.after(async () => { globalThis.fetch = original; server.closeAllConnections(); await new Promise(r => server.close(r)); await adapter.close(); });
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
  let requests = 0, challenge, proveedor = 'ok', periodo = 'dia', codigoRecibido;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input); requests++;
    assert.equal(options.redirect, 'error');
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const body = options.body;
      if (body.get('grant_type') === 'authorization_code') {
        codigoRecibido = body.get('code');
        assert.equal(body.get('redirect_uri'), origen + '/api/agenda/google/callback');
        assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), challenge);
        return json({ refresh_token: 'fixture-refresh-privado', scope: scopeGoogleAgenda });
      }
      assert.equal(body.get('refresh_token'), 'fixture-refresh-privado');
      return proveedor === 'revocado' ? json({ error: 'invalid_grant', secret: 'No exponer' }, 400) : json({ access_token: 'fixture-access-privado' });
    }
    assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/calendar/v3/calendars/primary/events');
    assert.equal(options.headers.Authorization, 'Bearer fixture-access-privado');
    assert.equal(url.searchParams.get('timeMin'), periodo === 'mes' ? '2026-11-01T03:00:00.000Z' : '2026-11-06T03:00:00.000Z');
    assert.equal(url.searchParams.get('timeMax'), periodo === 'mes' ? '2026-12-01T03:00:00.000Z' : '2026-11-07T03:00:00.000Z');
    assert.equal(url.searchParams.get('singleEvents'), 'true');
    assert.doesNotMatch(url.searchParams.get('fields'), /attendees|description/);
    if (proveedor === 'caido') return json({ error: { message: 'secreto remoto' } }, 503);
    if (periodo === 'mes') {
      if (url.searchParams.has('pageToken')) return json({ items: [
        { id: 'lunes', summary: 'Reunión lunes', start: { dateTime: '2026-11-09T13:00:00Z' }, end: { dateTime: '2026-11-09T14:00:00Z' } }
      ] });
      return json({ nextPageToken: 'mes2', items: [
        { id: 'viernes', summary: 'Reunión viernes', start: { dateTime: '2026-11-06T15:00:00Z' }, end: { dateTime: '2026-11-06T16:00:00Z' } },
        { id: 'cruce', summary: 'Cruza de mes', start: { dateTime: '2026-10-31T23:00:00-03:00' }, end: { dateTime: '2026-11-01T01:00:00-03:00' } },
        { id: 'jornada', summary: 'Dos días', start: { date: '2026-11-06' }, end: { date: '2026-11-08' } },
        { id: 'excluido', start: { dateTime: '2026-12-01T00:00:00-03:00' }, end: { dateTime: '2026-12-01T01:00:00-03:00' } }
      ] });
    }
    if (url.searchParams.has('pageToken')) return json({ items: [{ id: 'noche', summary: 'Cruza medianoche',
      start: { dateTime: '2026-11-07T02:00:00Z' }, end: { dateTime: '2026-11-07T05:00:00Z' } }] });
    return json({ nextPageToken: 'pagina2', items: [
      { id: 'dia', summary: 'Evento del día', start: { date: '2026-11-06' }, end: { date: '2026-11-07' } },
      { id: 'fuera', summary: 'Otro día', start: { date: '2026-11-07' }, end: { date: '2026-11-08' } },
      { id: 'cancelado', status: 'cancelled', start: { date: '2026-11-06' }, end: { date: '2026-11-07' } },
      { id: 'meet', summary: 'Reunión', description: 'privada', start: { dateTime: '2026-11-06T13:00:00Z' },
        end: { dateTime: '2026-11-06T14:00:00Z' }, hangoutLink: 'https://meet.google.com/abc-defg-hij', htmlLink: 'javascript:alert(1)' }
    ] });
  };
  async function req(path, jar, { method = 'GET', body, origin = origen, csrf = jar?.csrf } = {}, expected = 200) {
    const res = await original(base + '/api' + path, { method, redirect: 'manual', headers: {
      ...(origin ? { origin } : {}), ...(jar ? { cookie: jar.cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = res.status === 303 ? await res.text() : await res.json();
    assert.equal(res.status, expected, JSON.stringify(data));
    return { res, data: data.data, error: data.error };
  }
  async function login(user) {
    const { res, data } = await req('/auth/login', null, { method: 'POST', body: { email: user.email, password } });
    return { cookie: res.headers.get('set-cookie').split(';')[0], csrf: data.csrf_token };
  }
  const jar = await login(ana), otraSesion = await login(ana), ajena = await login(luz), sin = await login(sinAgenda);
  const path = '/agenda/google', dia = path + '/dias/2026-11-06', post = { method: 'POST', body: {} };
  async function iniciar() {
    const url = new URL((await req(path + '/conectar', jar, post)).data.url);
    challenge = url.searchParams.get('code_challenge');
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('scope'), scopeGoogleAgenda);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    return url.searchParams.get('state');
  }
  const callback = state => path + '/callback?code=fixture-code&state=' + state;
  await t.test('Deshabilitado no consulta Google; sin sesión, permiso, CSRF u origen correcto no vincula', async () => {
    process.env.GOOGLE_AGENDA_HABILITADO = 'false';
    assert.deepEqual((await req(dia, jar)).data, { disponible: false });
    process.env.GOOGLE_AGENDA_HABILITADO = 'true';
    await req(dia, null, {}, 401); await req(dia, sin, {}, 403);
    await req(path + '/conectar', jar, { ...post, csrf: 'mala' }, 403);
    await req(path + '/conectar', jar, { ...post, origin: 'http://localhost:5173' }, 409);
    await req(dia + '?usuario_id=' + luz.id, jar, {}, 422);
    await req(path + '/dias/2026-02-30', jar, {}, 422);
    assert.equal(requests, 0);
  });
  await t.test('State de un solo uso, misma sesión y PKCE; credenciales cifradas y ocultas', async () => {
    const state = await iniciar();
    await req(callback(state), otraSesion, { origin: null }, 403);
    await req(callback(state), ajena, { origin: null }, 403);
    await req(callback('0'.repeat(43)), jar, { origin: null }, 403);
    assert.equal(requests, 0);
    const res = await req(callback(state), jar, { origin: null }, 303);
    assert.equal(res.res.headers.get('location'), origen + '/campus/agenda?google=conectada');
    assert.equal(codigoRecibido, 'fixture-code');
    await req(callback(state), jar, { origin: null }, 403);
    const datos = await m.agenda_google_conexiones.scope('conCredenciales').findOne({ where: { usuario_id: ana.id } });
    assert.equal(datos.intento_cifrado, null); assert.doesNotMatch(datos.refresh_cifrado, /fixture/);
    assert.equal((await m.agenda_google_conexiones.findByPk(datos.id)).refresh_cifrado, undefined);
    assert.equal(await m.auditoria_eventos.count({ where: { accion: 'AGENDA_GOOGLE_CONECTADO' } }), 1);
  });
  await t.test('Consulta solo el día y el calendario principal; páginas, eventos completos y enlaces seguros', async () => {
    const { data } = await req(dia, jar);
    assert.deepEqual(data.eventos.map(e => e.id), ['dia', 'meet', 'noche']);
    assert.equal(data.eventos[0].todo_el_dia, true);
    assert.equal(data.eventos[1].meet, 'https://meet.google.com/abc-defg-hij');
    assert.equal(data.eventos[1].url, null);
    assert.doesNotMatch(JSON.stringify(data), /fixture|privada|description/);
    assert.equal((await req(dia, ajena)).data.conectada, false);
    assert.equal(await m.agenda_dias.count(), 0);
  });
  await t.test('Denegar consentimiento conserva vínculo anterior; caída y permiso revocado se muestran sin filtrar datos', async () => {
    const state = await iniciar();
    assert.equal((await req(path + '/callback?error=access_denied&state=' + state, jar, { origin: null }, 303)).res.headers.get('location'), origen + '/campus/agenda?google=cancelada');
    proveedor = 'caido';
    const { data } = await req(dia, jar); assert.equal(data.conectada, true); assert.ok(data.aviso); assert.doesNotMatch(JSON.stringify(data), /secreto/);
    proveedor = 'revocado'; assert.equal((await req(dia, jar)).data.reconectar, true);
    proveedor = 'ok';
  });
  await t.test('Mes completo con dos páginas, fechas argentinas y mismo aislamiento; no crea días ni tareas', async () => {
    const mes = path + '/mes/2026-11';
    periodo = 'mes';
    const antes = requests;
    const { data, res } = await req(mes, jar);
    assert.deepEqual(data.eventos.map(e => e.id), ['viernes', 'cruce', 'jornada', 'lunes']);
    assert.equal(requests - antes, 3); // Un refresh y dos páginas, sin 30 consultas por día.
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.equal((await req(mes, ajena)).data.conectada, false);
    await req(mes, null, {}, 401);
    await req(mes, sin, {}, 403);
    const sinConsultar = requests;
    for (const ruta of ['/mes/2026-13', '/mes/26-11', '/mes/2026-11-01', '/mes/2026-11?usuario_id=2']) await req(path + ruta, jar, {}, 422);
    assert.equal(requests, sinConsultar);
    assert.doesNotMatch(JSON.stringify(data), /fixture|refresh|secret|description/);
    assert.equal(await m.agenda_dias.count(), 0);
    proveedor = 'caido';
    assert.ok((await req(mes, jar)).data.aviso);
    proveedor = 'revocado';
    assert.equal((await req(mes, jar)).data.reconectar, true);
    proveedor = 'ok'; periodo = 'dia';
  });
  await t.test('Una credencial ilegible permite reconectar sin exponer datos privados', async () => {
    const row = await m.agenda_google_conexiones.scope('conCredenciales').findOne({ where: { usuario_id: ana.id } });
    const anterior = row.refresh_cifrado;
    await row.update({ refresh_cifrado: 'cifrado-no-valido' });
    const { data } = await req(dia, jar);
    assert.equal(data.reconectar, true);
    assert.equal(data.escritura_habilitada, false);
    assert.doesNotMatch(JSON.stringify(data), /cifrado-no-valido/);
    await row.update({ refresh_cifrado: anterior });
  });
  await t.test('Suspender Agenda bloquea lectura; desconectar elimina el permiso local y no borra tareas', async () => {
    await m.agenda_accesos.update({ estado: 'SUSPENDIDO' }, { where: { usuario_id: ana.id } });
    const antes = requests; await req(dia, jar, {}, 403); await req(path + '/mes/2026-11', jar, {}, 403); assert.equal(requests, antes);
    await req(path, jar, { method: 'DELETE', body: {} });
    assert.equal(await m.agenda_google_conexiones.count(), 0);
    await m.agenda_accesos.update({ estado: 'ACTIVO' }, { where: { usuario_id: ana.id } });
    assert.equal((await req(dia, jar)).data.conectada, false);
    assert.equal(await m.auditoria_eventos.count({ where: { accion: 'AGENDA_GOOGLE_DESCONECTADO' } }), 1);
  });
});
