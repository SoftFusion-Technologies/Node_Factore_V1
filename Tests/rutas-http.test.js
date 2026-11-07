import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Configuración de prueba aislada; no hay conexiones a MySQL ni credenciales DESA.
process.env.NODE_ENV = 'test';
process.env.DB_PASSWORD = 'Credencial ficticia del adaptador de pruebas';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
process.env.COOKIE_SECURE = 'false';
process.env.COOKIE_SAMESITE = 'Lax';
process.env.TRUST_PROXY = 'false';
const { default: db } = await import('../src/DataBase/db.js');
const { modelos } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { hashPassword } = await import('../src/utils/password.utils.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { prepararServidor, escuchar, cerrarServidor } = await import('../src/Services/Sistema/servidor.service.js');

test('Rutas: aplicación Express completa, cookies, módulos, multipart y campus con SQLite aislado', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const storage = await mkdtemp(path.join(os.tmpdir(), 'factore-rutas-'));
  process.env.STORAGE_ROOT = storage;
  const password = 'Clave aislada de rutas Factor E 2026';
  const hash = await hashPassword(password);
  const admin = await modelos.usuarios.create({ nombre: 'Juan', email: 'juan-rutas@example.invalid', rol: 'ADMIN', estado: 'ACTIVO', password_hash: hash });
  const client = await modelos.crm_clientes.create({ nombre: 'Alumno rutas' });
  const student = await modelos.usuarios.create({ nombre: 'Alumno rutas', email: 'alumno-rutas@example.invalid', cliente_id: client.id, rol: 'ALUMNO', estado: 'ACTIVO', password_hash: hash });
  const initial = await modelos.usuarios.create({ nombre: 'Primer ingreso', email: 'inicial-rutas@example.invalid', rol: 'ADMIN', estado: 'ACTIVO', password_hash: hash, cambiar_password: 1 });
  const app = crearApp();
  const server = createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await adapter.close(); await rm(storage, { recursive: true, force: true });
  });
  let adminJar, studentJar, tempJar, ficha, friend, course, module, lesson, file, material, assignment;
  const contract = JSON.parse(await readFile(new URL('../docs/rutas.json', import.meta.url), 'utf8'));
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const pdf = Buffer.from('%PDF-1.4\nGuía Factor E\n%%EOF\n');
  async function send(url, { jar = adminJar, method = 'GET', body, raw, headers = {} } = {}) {
    return fetch(base + url, { method, headers: {
      ...(jar ? { cookie: jar.cookie, 'x-csrf-token': jar.csrf } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  async function json(url, options = {}, status = 200) {
    const res = await send(url, options), value = await res.json();
    assert.equal(res.status, status, JSON.stringify(value)); return value;
  }
  async function login(user, clave = password) {
    const res = await send('/api/auth/login', { jar: null, method: 'POST', body: { email: user.email, password: clave } });
    const value = await res.json(); assert.equal(res.status, 200, JSON.stringify(value));
    assert.match(res.headers.get('set-cookie'), /Path=\/api; HttpOnly; SameSite=Lax/);
    return { cookie: res.headers.get('set-cookie').split(';')[0], csrf: value.data.csrf_token };
  }
  function multipart(name, mime, bytes) {
    const boundary = 'factore-rutas-boundary';
    return { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, raw: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
  }
  const api = '/api/admin', campus = '/api/campus';

  await t.test('Estado, 404, rutas exactas, cabeceras y CORS con credenciales', async () => {
    const res = await send('/api/status', { jar: null }); assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true); assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-powered-by'), null); assert.equal(res.headers.get('etag'), null);
    for (const url of ['/', '/uploads/archivo.mp4', '/api/STATUS', '/api/status/', '/api/no-existe']) await json(url, { jar: null }, 404);
    const pre = await send(api + '/archivos/subir/VIDEO', { jar: null, method: 'OPTIONS', headers: { origin: 'http://localhost:5173',
      'access-control-request-method': 'POST', 'access-control-request-headers': 'Content-Type, X-CSRF-Token' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(pre.headers.get('access-control-allow-credentials'), 'true'); assert.match(pre.headers.get('vary'), /Origin/);
    await json('/api/status', { jar: null, headers: { origin: 'https://ajeno.example.invalid' } }, 403);
    await json('/api/status', { jar: null, method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-headers': 'Authorization' } }, 403);
  });
  // Benjamin Orellana - 21/10/2026 - Incorporar las 18 rutas autenticadas de Agenda.
  await t.test('Todas las 132 rutas protegidas rechazan IDs libres sin cookie válida', async () => {
    const protectedRoutes = contract.filter(x => !['catalogo','checkout','checkout_cookie','checkout_preparar','webhook'].includes(x.perfil) && (x.perfil !== 'auth' || ['OBRS_MiPerfil_CTS', 'UR_MiPassword_CTS'].includes(x.handler)));
    assert.equal(protectedRoutes.length, 132);
    for (const route of protectedRoutes) {
      const res = await send(route.path.replace(/:[^/]+/g, '1'), { jar: null, method: route.method,
        ...(!['GET', 'HEAD'].includes(route.method) ? { body: {} } : {}), headers: { 'x-user-id': String(admin.id), authorization: 'Bearer ID-LIBRE' } });
      assert.equal(res.status, 401, route.method + ' ' + route.path); await res.arrayBuffer();
    }
  });
  await t.test('Rol correcto en todas las rutas de gestión y campus, perfil propio y proxy desactivado', async () => {
    adminJar = await login(admin); studentJar = await login(student); tempJar = await login(initial);
    assert.equal((await json('/api/auth/me')).data.usuario.id, String(admin.id));
    assert.equal(app.get('trust proxy'), false);
    for (const route of contract.filter(x => ['admin', 'alumno'].includes(x.perfil))) {
      const res = await send(route.path.replace(/:[^/]+/g, '1'), { jar: route.perfil === 'admin' ? studentJar : adminJar,
        method: route.method, ...(!['GET', 'HEAD'].includes(route.method) ? { body: {} } : {}) });
      assert.equal(res.status, 403, route.method + ' ' + route.path); await res.arrayBuffer();
    }
    await json(api + '/clientes', { jar: tempJar }, 403);
    await json('/api/auth/me', { jar: tempJar });
  });
  await t.test('Cambio obligatorio de contraseña accesible, revocación y nuevo login por las rutas reales', async () => {
    const nueva = 'Nueva clave del primer ingreso Factor E 2026';
    await json('/api/auth/password', { jar: tempJar, method: 'PATCH', body: { password_actual: password, password_nuevo: nueva } });
    await json('/api/auth/me', { jar: tempJar }, 401);
    tempJar = await login(initial, nueva);
    await json(api + '/clientes', { jar: tempJar });
  });
  await t.test('CSRF y origen antes del cuerpo, JSON inválido, tamaño, formato y query repetida', async () => {
    const before = await modelos.crm_clientes.count();
    await json(api + '/clientes', { method: 'POST', body: { nombre: 'No guardar' }, headers: { 'x-csrf-token': '' } }, 403);
    const calls = adapter.statements.length;
    await json(api + '/clientes', { method: 'POST', raw: '{', headers: { origin: 'https://ajeno.example.invalid', 'content-type': 'application/json' } }, 403);
    assert.equal(adapter.statements.length, calls);
    await json(api + '/clientes', { jar: null, method: 'POST', raw: '{', headers: { 'content-type': 'application/json' } }, 401);
    await json(api + '/clientes', { method: 'POST', raw: '{', headers: { 'content-type': 'application/json' } }, 400);
    await json(api + '/clientes', { method: 'POST', raw: 'nombre=No', headers: { 'content-type': 'application/x-www-form-urlencoded' } }, 415);
    await json(api + '/clientes', { method: 'POST', body: { nombre: 'x'.repeat(1024 * 1024) } }, 413);
    await json(api + '/clientes?q=uno&q=dos', {}, 422);
    await json(api + '/clientes/%ZZ', {}, 400);
    assert.equal(await modelos.crm_clientes.count(), before);
  });
  await t.test('CRM completo: ficha sin cuenta, notas privadas, comercio y vínculos con parámetros anidados', async () => {
    ficha = (await json(api + '/clientes', { method: 'POST', body: { nombre: 'Cliente sin cuenta' } }, 201)).data;
    assert.equal(await modelos.usuarios.count({ where: { cliente_id: ficha.id } }), 0);
    const note = (await json(api + `/clientes/${ficha.id}/notas`, { method: 'POST', body: { contenido: 'Nota interna' } }, 201)).data;
    await json(api + `/clientes/${ficha.id}/notas/${note.id}`, { method: 'PATCH', body: { contenido: 'Nota editada' } });
    await json(api + `/clientes/${ficha.id}/notas/${note.id}`);
    await json(api + `/clientes/${client.id}/notas/${note.id}`, {}, 404);
    friend = (await json(api + '/comercios', { method: 'POST', body: { nombre: 'Comercio de Factor E', mostrar_a_usuarios: true, observaciones_internas: 'Privado' } }, 201)).data;
    const link = (await json(api + `/comercios/${friend.id}/clientes`, { method: 'POST', body: { cliente_id: ficha.id, funcion: 'Contacto' } }, 201)).data;
    await json(api + `/comercios/${friend.id}/clientes/${link.id}`, { method: 'PATCH', body: { funcion: 'Responsable' } });
    assert.equal((await json(api + `/clientes/${ficha.id}/comercios`)).data.length, 1);
    const visibles = await json(campus + '/comercios', { jar: studentJar });
    assert.equal(visibles.data.length, 1); assert.ok(!JSON.stringify(visibles).includes('observaciones_internas'));
    await json(campus + `/comercios/${friend.id}`, { jar: studentJar });
    await json(api + `/comercios/${friend.id}/clientes/${link.id}`, { method: 'DELETE', body: {} });
    await json(api + `/clientes/${ficha.id}/notas/${note.id}`, { method: 'DELETE', body: {} });
  });
  await t.test('Subidas HTTP sin buffer JSON, árbol de curso, publicación y material', async () => {
    file = (await json(api + '/archivos/subir/VIDEO', multipart('clase.mp4', 'video/mp4', mp4), 201)).data;
    const image = (await json(api + '/archivos/subir/IMAGEN', multipart('portada.png', 'image/png', png), 201)).data;
    const document = (await json(api + '/archivos/subir/DOCUMENTO', multipart('guia.pdf', 'application/pdf', pdf), 201)).data;
    await json(api + `/archivos/${file.id}/duracion`, { method: 'PATCH', body: { duracion_segundos: 120 } });
    course = (await json(api + '/cursos', { method: 'POST', body: { titulo: 'Curso con rutas', portada_archivo_id: image.id } }, 201)).data;
    module = (await json(api + `/cursos/${course.id}/modulos`, { method: 'POST', body: { titulo: 'Primer módulo' } }, 201)).data;
    lesson = (await json(api + `/cursos/${course.id}/lecciones`, { method: 'POST', body: { titulo: 'Primer video', modulo_id: module.id, video_archivo_id: file.id, portada_archivo_id: image.id, estado: 'PUBLICADA' } }, 201)).data;
    material = (await json(api + `/cursos/${course.id}/materiales`, { method: 'POST', body: { titulo: 'Guía', archivo_id: document.id } }, 201)).data;
    await json(api + `/cursos/${course.id}`, { method: 'PATCH', body: { estado: 'PUBLICADO' } });
    for (const resource of ['modulos', 'lecciones', 'materiales']) assert.equal((await json(api + `/cursos/${course.id}/${resource}`)).data.length, 1);
    await json(api + `/cursos/${course.id}/modulos/${module.id}`);
    await json(api + `/cursos/${course.id}/lecciones/${lesson.id}`);
    await json(api + `/cursos/${course.id}/materiales/${material.id}`);
    await json(api + `/archivos/${file.id}/referencias`);
  });
  await t.test('Asignación manual, excepciones e historial conectan la gestión con el campus y el progreso', async () => {
    assignment = (await json(api + '/accesos', { method: 'POST', body: { usuario_id: student.id, curso_id: course.id, vence_en: '2099-01-01T00:00:00.000Z' } }, 201)).data;
    const cp = campus + `/cursos/${course.id}`, lp = cp + `/lecciones/${lesson.id}`;
    assert.equal((await json(campus + '/cursos', { jar: studentJar })).data.length, 1);
    await json(cp, { jar: studentJar }); await json(lp, { jar: studentJar });
    await json(cp + '/materiales', { jar: studentJar });
    await json(lp + '/progreso', { jar: studentJar, method: 'PATCH', body: { posicion_segundos: 40, completada: true } });
    await json(cp + '/progreso', { jar: studentJar });
    const ap = api + `/accesos/${assignment.id}`;
    await json(ap); await json(ap + '/lecciones'); await json(ap + '/historial');
    await json(ap + `/lecciones/${lesson.id}`, { method: 'PATCH', body: { estado: 'BLOQUEADA' } });
    await json(lp, { jar: studentJar }, 404);
    await json(ap + `/lecciones/${lesson.id}`, { method: 'DELETE', body: { confirmar: true } });
    await json(lp, { jar: studentJar });
    await json(ap + '/suspender', { method: 'POST', body: {} });
    await json(cp, { jar: studentJar }, 404);
    await json(ap + '/reactivar', { method: 'POST', body: {} });
    await json(cp, { jar: studentJar });
  });
  await t.test('Las seis rutas de archivos responden GET/HEAD y rangos; revocar impide reproducir', async () => {
    // Asociación administrativa real, con transacción, auditoría y referencias.
    await json(api + `/comercios/${friend.id}/logo`, { method:'PATCH', body:{ logo_archivo_id:course.portada_archivo_id } });
    const paths = [api + `/archivos/${file.id}/contenido`, campus + `/cursos/${course.id}/lecciones/${lesson.id}/video`,
      campus + `/cursos/${course.id}/portada`, campus + `/cursos/${course.id}/lecciones/${lesson.id}/portada`,
      campus + `/cursos/${course.id}/materiales/${material.id}/contenido`, campus + `/comercios/${friend.id}/logo`];
    for (const url of paths) {
      const jar = url.startsWith(campus) ? studentJar : adminJar;
      const head = await send(url, { jar, method: 'HEAD' }); assert.equal(head.status, 200, url);
      assert.equal((await head.arrayBuffer()).byteLength, 0); assert.ok(Number(head.headers.get('content-length')) > 0);
      const get = await send(url, { jar, headers: { range: 'bytes=0-3', origin: 'http://localhost:5173' } });
      assert.equal(get.status, 206, url); assert.equal((await get.arrayBuffer()).byteLength, 4);
      assert.equal(get.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    }
    await json(api + `/accesos/${assignment.id}`, { method: 'DELETE', body: {} });
    await json(paths[1], { jar: studentJar }, 404);
    await json(api + `/accesos/${assignment.id}/renovar`, { method: 'POST', body: { vence_en: null } });
    const progress = await modelos.leccion_progreso.findOne({ where: { usuario_id: student.id, leccion_id: lesson.id } });
    assert.equal(progress.estado, 'COMPLETADA');
  });
  await t.test('Cuenta pendiente, activación y recuperación manual, sesiones y logout idempotente', async () => {
    const u = (await json(api + '/usuarios', { method: 'POST', body: { nombre: 'Cuenta manual', email: 'manual-rutas@example.invalid', cliente_id: ficha.id } }, 201)).data;
    await json(api + `/usuarios/${u.id}`); await json(api + '/usuarios');
    const activation = (await json(api + `/usuarios/${u.id}/activacion`, { method: 'POST', body: {} }, 201)).data;
    await json('/api/auth/activar', { jar: null, method: 'POST', body: { token: activation.token, password } });
    const jar = await login(u);
    // El mismo alumno creado y activado recorre asignación, campus, seguimiento,
    // suspensión y renovación por HTTP; todo ocurre en el fixture aislado.
    const granted = (await json(api + '/accesos', { method: 'POST', body: { usuario_id: u.id, curso_id: course.id } }, 201)).data;
    const cp = campus + `/cursos/${course.id}`, lp = cp + `/lecciones/${lesson.id}`;
    await json(lp, { jar });
    const video = await send(lp + '/video', { jar, headers: { range: 'bytes=0-3' } });
    assert.equal(video.status, 206); assert.equal((await video.arrayBuffer()).byteLength, 4);
    await json(lp + '/progreso', { jar, method: 'PATCH', body: { posicion_segundos: 8, completada: true } });
    const followed = async () => (await json(api + '/seguimiento?usuario_id=' + u.id)).data[0];
    assert.equal(Number((await followed()).porcentaje), 100);
    await json(api + `/accesos/${granted.id}/suspender`, { method: 'POST', body: {} });
    await json(lp + '/video', { jar }, 404);
    const suspended = await followed();
    assert.equal(suspended.porcentaje, null); assert.equal(Number(suspended.lecciones_completadas_historial), 1);
    await json(api + `/accesos/${granted.id}/reactivar`, { method: 'POST', body: {} });
    await json(api + `/accesos/${granted.id}`, { method: 'DELETE', body: {} });
    await json(cp, { jar }, 404);
    await json(api + `/accesos/${granted.id}/renovar`, { method: 'POST', body: { vence_en: null } });
    assert.equal(Number((await followed()).porcentaje), 100);
    const persistent = await modelos.leccion_progreso.findOne({ where: { usuario_id: u.id, leccion_id: lesson.id } });
    assert.equal(persistent.estado, 'COMPLETADA'); assert.equal(persistent.posicion_segundos, 8);
    assert.equal(await modelos.auditoria_eventos.count({ where: { usuario_id: u.id, entidad: 'leccion_progreso', entidad_id: persistent.id, accion: 'LECCION_COMPLETADA' } }), 1);
    const recovery = (await json(api + `/usuarios/${u.id}/recuperacion`, { method: 'POST', body: {} }, 201)).data;
    await json('/api/auth/me', { jar }, 401);
    const nueva = 'Nueva clave recuperada para rutas Factor E 2026';
    await json('/api/auth/recuperar', { jar: null, method: 'POST', body: { token: recovery.token, password: nueva } });
    const recovered = await login(u, nueva);
    await json(api + `/usuarios/${u.id}/sesiones`, { method: 'DELETE', body: {} });
    await json('/api/auth/me', { jar: recovered }, 401);
    await json('/api/auth/logout', { jar: recovered, method: 'POST', body: {} });
    await json('/api/auth/logout', { jar: null, method: 'POST', body: {} });
  });
  await t.test('Retirar el último video elimina del disco a través de DELETE y los accesos quedan preservados', async () => {
    const record = await modelos.archivos.findByPk(file.id); const disk = path.join(storage, record.ruta_relativa);
    await access(disk);
    await json(api + `/archivos/${file.id}`, { method: 'DELETE', body: {} }, 409);
    await json(api + `/cursos/${course.id}/lecciones/${lesson.id}/video`, { method: 'DELETE', body: {} });
    await assert.rejects(access(disk), { code: 'ENOENT' });
    assert.equal((await modelos.archivos.findByPk(file.id)).estado, 'ELIMINADO');
    assert.ok(await modelos.curso_accesos.findByPk(assignment.id));
  });
  await t.test('Arranque comprueba esquema y storage, puerto ocupado falla y el cierre ordenado libera la escucha', async () => {
    // Solo las consultas de metadata se simulan; toda la integración de rutas usa SQL real sobre SQLite.
    const original = db.query;
    db.query = function (sql, options) {
      if (sql === 'SELECT @@session.time_zone AS zona') return Promise.resolve([{ zona: '+00:00' }]);
      if (sql.startsWith('SELECT TABLE_NAME FROM information_schema')) return Promise.resolve([
        ...Object.keys(modelos), 'vw_accesos_estado', 'vw_campus_lecciones_habilitadas', 'vw_campus_progreso_cursos', 'vw_campus_comercios_visibles'
      ].map(TABLE_NAME => ({ TABLE_NAME })));
      return original.call(this, sql, options);
    };
    try { await prepararServidor(); } finally { db.query = original; }
    process.env.PORT = String(server.address().port);
    await assert.rejects(escuchar(app), { code: 'EADDRINUSE' });
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    process.env.PORT = String(probe.address().port); await new Promise(resolve => probe.close(resolve));
    const real = await escuchar(app);
    assert.equal(real.requestTimeout, 1805000); assert.equal(real.headersTimeout, 60000);
    assert.equal((await fetch(`http://127.0.0.1:${real.address().port}/api/status`)).status, 200);
    await cerrarServidor(real); assert.equal(real.listening, false);
  });
});
