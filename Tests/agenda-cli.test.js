/* Benjamin Orellana - 21/10/2026 - Prueba de consola: entrada oculta, solo lectura y logout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Benjamin Orellana - 21/10/2026 - Usar el formato CSRF real, no el de la cookie.
import { tokenCsrf, hashPassword } from '../src/utils/password.utils.js';

test('CLI Agenda: credenciales ocultas y ningún permiso o contenido modificado', async t => {
  const password = 'Clave ficticia privada CLI Agenda';
  const cookie = randomBytes(32).toString('base64url'), csrf = tokenCsrf(cookie);
  assert.equal(cookie.length, 43); assert.match(csrf, /^[a-f0-9]{64}$/);
  let modo, calls;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    calls.push({ method: req.method, url: req.url, headers: req.headers,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : null });
    res.setHeader('Content-Type', 'application/json');
    let data;
    if (req.url === '/api/auth/login') {
      res.setHeader('Set-Cookie', `factore_sid=${cookie}; Path=/api; HttpOnly`);
      data = { usuario: { cambiar_password: 0 }, csrf_token: csrf };
    } else if (req.url === '/api/agenda/estado') {
      if (modo === 'error') {
        res.statusCode = 503; res.end(JSON.stringify({ error: { code: 'PRUEBA_ERROR', message: 'DETALLE_PRIVADO_INTERNO' } })); return;
      }
      data = { habilitada: modo === 'activa', estado_temporal: modo === 'activa' ? 'ACTIVO' : 'SIN_ACCESO' };
    } else if (req.url.startsWith('/api/agenda/mes?')) data = { dias: Array.from({ length: 31 }, () => ({})), hoy: '2026-10-21' };
    else if (req.url === '/api/agenda/dias/2026-10-21') data = { tareas: [{ texto: 'TAREA_PRIVADA_NO_IMPRIMIR' }], notas: [] };
    else data = { ok: true };
    res.end(JSON.stringify({ data }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  for (const estado of ['bloqueada', 'activa', 'error']) await t.test('Estado ' + estado, async () => {
    modo = estado; calls = [];
    const child = spawn('script', ['-q', '-e', '-c', `"${process.execPath}" Scripts/probar-agenda-http.js`, '/dev/null'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(server.address().port),
        FRONTEND_URL: 'http://127.0.0.1:5173', ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
        COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', TRUST_PROXY: 'false' }
    });
    let output = '', step = 0;
    const prompts = [['Email: ', 'agenda-cli@example.invalid'], ['Contraseña (entrada oculta): ', password]];
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15000); timeout.unref();
    child.stdout.on('data', chunk => {
      output += chunk;
      if (step < prompts.length && output.includes(prompts[step][0])) { child.stdin.write(prompts[step][1] + '\n'); step++; }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit'); clearTimeout(timeout);
    assert.equal(code, estado === 'error' ? 1 : 0, output); assert.equal(step, 2);
    assert.equal(calls[0].body.password, password);
    assert.equal(calls.at(-1).url, '/api/auth/logout');
    assert.equal(calls.at(-1).headers.cookie, 'factore_sid=' + cookie);
    assert.equal(calls.at(-1).headers['x-csrf-token'], csrf);
    assert.ok(calls.every(call => call.headers.origin === 'http://127.0.0.1:5173'));
    assert.ok(calls.filter(call => call.url.startsWith('/api/agenda')).every(call => call.method === 'GET'));
    for (const secret of [password, cookie, csrf, 'TAREA_PRIVADA_NO_IMPRIMIR', 'DETALLE_PRIVADO_INTERNO']) assert.ok(!output.includes(secret));
    if (estado === 'bloqueada') {
      assert.equal(calls.length, 3); assert.match(output, /"agenda_habilitada":false/); assert.match(output, /"logout":true/);
    }
    if (estado === 'activa') { assert.equal(calls.length, 5); assert.match(output, /"tareas":1/); }
    if (estado === 'error') assert.match(output, /PRUEBA_ERROR/);
  });
});

test('CLI Agenda contra login/logout y estado de la aplicación real, con SQLite aislado', async t => {
  Object.assign(process.env, { NODE_ENV: 'test', DB_PASSWORD: 'Solo fixture CLI Agenda', FRONTEND_URL: 'http://127.0.0.1:5173',
    ALLOWED_ORIGINS: 'http://127.0.0.1:5173', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', TRUST_PROXY: 'false',
    MP_HABILITADO: 'false', CORREO_HABILITADO: 'false' });
  const { default: db } = await import('../src/DataBase/db.js');
  const { modelos: m } = await import('../src/Models/index.js');
  const { conectarPrueba } = await import('./adapter-crm.js');
  const { crearApp } = await import('../app.js');
  const adapter = await conectarPrueba(db, { extras: ['agenda.sqlite.sql'] });
  const password = 'Clave real de fixture CLI Agenda';
  const usuario = await m.usuarios.create({ nombre: 'CLI Agenda', email: 'cli-real@agenda.invalid', rol: 'ADMIN',
    estado: 'ACTIVO', cambiar_password: 0, password_hash: await hashPassword(password) });
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await adapter.close(); });
  for (const habilitada of [false, true]) {
    if (habilitada) await m.agenda_accesos.create({ usuario_id: usuario.id, estado: 'ACTIVO',
      inicio_en: new Date(Date.now() - 60000), otorgado_por: usuario.id });
    const child = spawn('script', ['-q', '-e', '-c', `"${process.execPath}" Scripts/probar-agenda-http.js`, '/dev/null'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(server.address().port) }
    });
    let output = '', step = 0;
    const prompts = [['Email: ', usuario.email], ['Contraseña (entrada oculta): ', password]];
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15000); timeout.unref();
    child.stdout.on('data', chunk => {
      output += chunk;
      if (step < prompts.length && output.includes(prompts[step][0])) { child.stdin.write(prompts[step][1] + '\n'); step++; }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit'); clearTimeout(timeout);
    assert.equal(code, 0, output); assert.equal(step, 2);
    assert.ok(!output.includes(password));
    assert.ok(output.includes('"agenda_habilitada":' + habilitada));
    assert.match(output, /"logout":true/);
    const sesion = await m.usuarios_sesiones.scope('conHash').findOne({ where: { usuario_id: usuario.id }, order: [['id', 'DESC']] });
    assert.ok(sesion.revocada_en, 'La sesión creada por la CLI debe quedar revocada por logout real.');
    assert.ok(!output.includes(sesion.token_hash));
  }
  assert.equal(await m.agenda_dias.count(), 0, 'Leer el día desde la CLI no debe crearlo.');
});
