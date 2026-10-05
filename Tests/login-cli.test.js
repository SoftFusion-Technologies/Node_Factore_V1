import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('CLI HTTP: contraseña oculta, cambio obligatorio, nuevo login y logout sin imprimir secretos', async t => {
  const original = 'Clave ficticia inicial CLI 2026', updated = 'Clave ficticia cambiada CLI 2026';
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const part of req) chunks.push(part);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
    calls.push({ url: req.url, method: req.method, body, cookie: req.headers.cookie, csrf: req.headers['x-csrf-token'] });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/auth/login') {
      res.setHeader('Set-Cookie', 'factore_sid=COOKIE_PRIVADA_DE_PRUEBA; Path=/api; HttpOnly');
      res.end(JSON.stringify({ data: { usuario: { id: '1', rol: 'ADMIN', cambiar_password: calls.length === 1 ? 1 : 0 }, csrf_token: 'CSRF_PRIVADO_DE_PRUEBA' } }));
    } else res.end(JSON.stringify({ data: { ok: true } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let child;
  t.after(async () => { if (child?.exitCode === null) child.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const project = fileURLToPath(new URL('../', import.meta.url));
  child = spawn('script', ['-q', '-e', '-c', `"${process.execPath}" Scripts/probar-login.js`, '/dev/null'], { cwd: project,
    env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(server.address().port), TRUST_PROXY: 'false', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax' } });
  let output = '', step = 0;
  const prompts = [['Email: ', 'cli@example.invalid'], ['Contraseña (entrada oculta): ', original],
    ['Nueva contraseña (entrada oculta): ', updated], ['Repetir nueva contraseña: ', updated]];
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000); timer.unref();
  child.stdout.on('data', chunk => {
    output += chunk;
    if (step < prompts.length && output.includes(prompts[step][0])) { child.stdin.write(prompts[step][1] + '\n'); step++; }
  });
  child.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(child, 'exit'); clearTimeout(timer);
  assert.equal(code, 0, output);
  assert.equal(step, 4); assert.match(output, /"login":true/);
  for (const secret of [original, updated, 'COOKIE_PRIVADA_DE_PRUEBA', 'CSRF_PRIVADO_DE_PRUEBA']) assert.ok(!output.includes(secret));
  assert.deepEqual(calls.map(x => [x.method, x.url]), [['POST', '/api/auth/login'], ['PATCH', '/api/auth/password'], ['POST', '/api/auth/login'], ['GET', '/api/auth/me'], ['POST', '/api/auth/logout']]);
  assert.equal(calls[0].body.password, original); assert.equal(calls[1].body.password_nuevo, updated); assert.equal(calls[2].body.password, updated);
  for (const i of [1, 3, 4]) { assert.equal(calls[i].cookie, 'factore_sid=COOKIE_PRIVADA_DE_PRUEBA'); assert.equal(calls[i].csrf, 'CSRF_PRIVADO_DE_PRUEBA'); }
});
