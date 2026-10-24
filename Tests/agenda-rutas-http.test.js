/* Benjamin Orellana - 21/10/2026 - Agenda en la aplicación Express real con SQL aislado. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';

Object.assign(process.env, { NODE_ENV: 'test', DB_PASSWORD: 'Solo fixture Agenda', FRONTEND_URL: 'http://127.0.0.1:5173',
  ALLOWED_ORIGINS: 'http://127.0.0.1:5173', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', TRUST_PROXY: 'false',
  MP_HABILITADO: 'false', CORREO_HABILITADO: 'false' });
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { hashPassword } = await import('../src/utils/password.utils.js');

test('Agenda: rutas reales, login, permisos y operaciones integradas sin MySQL DESA', async t => {
  const adapter = await conectarPrueba(db, { extras: ['agenda.sqlite.sql'] });
  const originalQuery = db.query;
  let reloj = new Date('2026-10-21T15:30:00.000Z');
  db.query = function (sql, options) {
    if (sql === 'SELECT UTC_TIMESTAMP(3) AS ahora_en') return Promise.resolve([{ ahora_en: reloj.toISOString() }]);
    return originalQuery.call(this, sql, options);
  };
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    db.query = originalQuery; await adapter.close();
  });
  const password = 'Agenda HTTP prueba 2026';
  const hash = await hashPassword(password);
  async function cuenta(nombre, rol = 'ALUMNO', cambiar_password = 0) {
    const cliente = rol === 'ALUMNO' ? await m.crm_clientes.create({ nombre }) : null;
    return m.usuarios.create({ nombre, email: nombre.toLowerCase() + '@agenda-rutas.invalid',
      rol, cliente_id: cliente?.id ?? null, estado: 'ACTIVO', cambiar_password, password_hash: hash });
  }
  const admin = await cuenta('Juan', 'ADMIN'), ana = await cuenta('Ana'), luz = await cuenta('Luz');
  const inicial = await cuenta('Inicial', 'ADMIN', 1);
  let adminJar, anaJar, luzJar, inicialJar;
  const prefix = '/api/agenda', acceso = '/api/admin/agenda/accesos/';
  const dia = prefix + '/dias/2026-10-21';
  const contract = JSON.parse(await readFile(new URL('../docs/rutas.json', import.meta.url), 'utf8')).filter(row => row.modulo === 'agenda');

  async function enviar(path, { jar = anaJar, method = 'GET', body, raw, headers = {} } = {}, expected = 200) {
    const response = await fetch(base + path, { method, headers: { origin: process.env.FRONTEND_URL,
      ...(jar ? { cookie: jar.cookie, 'x-csrf-token': jar.csrf } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(raw !== undefined ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (method === 'HEAD') { assert.equal(response.status, expected); return { response }; }
    const value = await response.json();
    assert.equal(response.status, expected, path + ': ' + JSON.stringify(value));
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('x-powered-by'), null);
    return { response, value, data: value.data };
  }
  async function login(user) {
    const { response, data } = await enviar('/api/auth/login', { jar: null, method: 'POST', body: { email: user.email, password } });
    const cookie = response.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/);
    return { cookie: cookie.split(';')[0], csrf: data.csrf_token };
  }
  async function permiso(user, cambios = {}) {
    const { data: previo } = await enviar(acceso + user.id, { jar: adminJar });
    return (await enviar(acceso + user.id, { jar: adminJar, method: 'PATCH', body: { estado: 'ACTIVO',
      version: previo.version, motivo: 'Prueba individual de rutas', ...cambios } })).data;
  }

  await t.test('Las 18 rutas rechazan IDs y Authorization sin cookie; CORS funciona antes de leer el cuerpo', async () => {
    assert.equal(contract.length, 18);
    for (const ruta of contract) {
      await enviar(ruta.path.replace(/:[^/]+/g, '1'), { jar: null, method: ruta.method,
        ...(['GET', 'HEAD'].includes(ruta.method) ? {} : { body: {} }),
        headers: { 'x-user-id': String(admin.id), authorization: 'Bearer ID_LIBRE' } }, 401);
    }
    const antes = adapter.statements.length;
    await enviar(dia, { jar: null, method: 'PATCH', raw: '{', headers: { origin: 'https://ajeno.invalid', 'content-type': 'application/json' } }, 403);
    assert.equal(adapter.statements.length, antes);
    const pre = await fetch(base + dia, { method: 'OPTIONS', headers: { origin: process.env.FRONTEND_URL,
      'access-control-request-method': 'PATCH', 'access-control-request-headers': 'Content-Type, X-CSRF-Token' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-credentials'), 'true');
  });
  await t.test('Login real y contraseña pendiente; ningún rol obtiene Agenda automáticamente', async () => {
    adminJar = await login(admin); anaJar = await login(ana); luzJar = await login(luz); inicialJar = await login(inicial);
    await enviar(prefix + '/estado', { jar: inicialJar }, 403);
    for (const jar of [adminJar, anaJar, luzJar]) {
      assert.equal((await enviar(prefix + '/estado', { jar })).data.estado_temporal, 'SIN_ACCESO');
      await enviar(dia, { jar }, 403);
    }
    assert.equal(await m.agenda_accesos.count(), 0);
    assert.equal(await m.agenda_dias.count(), 0);
  });
  await t.test('CSRF y origen se comprueban antes del JSON; formato, compresión y tamaño limitados', async () => {
    const req = { method: 'PATCH', raw: '{', headers: { 'content-type': 'application/json' } };
    await enviar(dia, { ...req, jar: null }, 401);
    await enviar(dia, { ...req, headers: { ...req.headers, 'x-csrf-token': 'OTRO' } }, 403);
    const sinOrigen = await fetch(base + dia, { method: 'PATCH', headers: { cookie: anaJar.cookie,
      'x-csrf-token': anaJar.csrf, 'content-type': 'application/json' }, body: '{' });
    assert.equal(sinOrigen.status, 403); assert.equal((await sinOrigen.json()).error.code, 'ORIGEN_REQUERIDO');
    await enviar(dia, req, 400);
    await enviar(dia, { method: 'PATCH', raw: '{}', headers: { 'content-type': 'text/plain' } }, 415);
    await enviar(dia, { method: 'PATCH', raw: '{}', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } }, 415);
    await enviar(dia, { method: 'PATCH', body: { version: 0, frase: 'x'.repeat(1024 * 1024) } }, 413);
    assert.equal(await m.agenda_dias.count(), 0);
  });
  await t.test('Gestión solo ADMIN y permiso individual; cambiarlo no afecta otra cuenta', async () => {
    await enviar(acceso + ana.id, {}, 403);
    await enviar(acceso + ana.id, { method: 'PATCH', body: { version: 0, estado: 'ACTIVO', motivo: 'No puede' } }, 403);
    await permiso(ana); await permiso(luz);
    assert.equal((await enviar(prefix + '/estado')).data.habilitada, true);
    assert.equal((await enviar(prefix + '/estado', { jar: adminJar })).data.habilitada, false);
    await enviar(acceso + ana.id, { jar: adminJar, method: 'PATCH', body: { version: 0, estado: 'ACTIVO', motivo: 'Vieja' } }, 409);
    await enviar(acceso + ana.id, { jar: adminJar, method: 'PATCH', body: { version: 1, estado: 'ACTIVO', motivo: 'Inválida', usuario_id: luz.id } }, 422);
  });
  let tarea, nota1, nota2;
  await t.test('Día, pilares, tareas, recordatorios y preferencias conectados por sus paths definitivos', async () => {
    const vacio = (await enviar(dia)).data; assert.equal(vacio.dia.version, 0);
    const guardado = (await enviar(dia, { method: 'PATCH', body: { version: 0, frase: 'Frase privada',
      prioridad_1_texto: 'Planificar', prioridad_1_cumplida: 1 } })).data;
    assert.equal(guardado.version, 1);
    tarea = (await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Tarea privada', categoria: 'COMERCIAL',
      prioridad: 1, hora: '12:29', recordatorio: 1 } }, 201)).data;
    const recordada = (await enviar(prefix + '/tareas/' + tarea.id + '/recordar', { method: 'POST', body: { version: tarea.version } })).data;
    assert.equal(recordada.recordatorio_marcado, true);
    tarea = (await enviar(prefix + '/tareas/' + tarea.id, { method: 'PATCH', body: { version: recordada.version, completada: true } })).data;
    assert.equal(tarea.completada, 1);
    await enviar(prefix + '/tareas/' + tarea.id, { method: 'PATCH', body: { version: 1, texto: 'Vieja' } }, 409);
    const preferencias = (await enviar(prefix + '/preferencias', { method: 'PATCH', body: { version: 0, tema: 'OSCURO' } })).data;
    assert.equal(preferencias.tema, 'OSCURO');
    const detalle = (await enviar(dia)).data; assert.equal(detalle.progreso.porcentaje, 100);
    const mes = (await enviar(prefix + '/mes?mes=2026-10')).data;
    assert.equal(mes.dias.length, 31); assert.equal(mes.dias.find(d => d.fecha === '2026-10-21').estado, 'COMPLETADO');
  });
  await t.test('Notas: crear, editar, ordenar y borrar; otros propietarios no pueden acceder por ID', async () => {
    nota1 = (await enviar(dia + '/notas', { method: 'POST', body: { texto: 'Nota privada uno' } }, 201)).data;
    nota2 = (await enviar(dia + '/notas', { method: 'POST', body: { texto: 'Nota privada dos' } }, 201)).data;
    nota2 = (await enviar(prefix + '/notas/' + nota2.id, { method: 'PATCH', body: { version: nota2.version, cumplida: true } })).data;
    const ordenadas = (await enviar(dia + '/notas/orden', { method: 'PATCH', body: { notas: [
      { id: nota2.id, version: nota2.version }, { id: nota1.id, version: nota1.version }
    ] } })).data;
    assert.equal(ordenadas[0].id, nota2.id); nota1 = ordenadas[1]; nota2 = ordenadas[0];
    for (const [path, method, body] of [
      [prefix + '/tareas/' + tarea.id, 'PATCH', { version: tarea.version, texto: 'Ajena' }],
      [prefix + '/tareas/' + tarea.id, 'DELETE', { version: tarea.version }],
      [prefix + '/notas/' + nota1.id, 'PATCH', { version: nota1.version, texto: 'Ajena' }],
      [prefix + '/notas/' + nota1.id, 'DELETE', { version: nota1.version }]
    ]) await enviar(path, { jar: luzJar, method, body }, 404);
    const ajena = JSON.stringify((await enviar(dia, { jar: luzJar })).data);
    assert.ok(!ajena.includes('privada'));
    await enviar(prefix + '/notas/' + nota1.id, { method: 'DELETE', body: { version: nota1.version } });
  });
  await t.test('Reordenar más de 100 notas admite una lista mayor a 16 KB sin recortarla', async () => {
    const fecha = '2026-10-22';
    const row = await m.agenda_dias.create({ usuario_id: ana.id, fecha });
    await m.agenda_notas.bulkCreate(Array.from({ length: 450 }, (_, i) => ({ id: String(100000000000000000n + BigInt(i)),
      usuario_id: ana.id, dia_id: row.id, texto: 'Nota ' + i, orden: i })));
    const notas = (await enviar(prefix + '/dias/' + fecha)).data.notas;
    const body = { notas: [...notas].reverse().map(n => ({ id: n.id, version: n.version })) };
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 16 * 1024);
    const ordenadas = (await enviar(prefix + '/dias/' + fecha + '/notas/orden', { method: 'PATCH', body })).data;
    assert.equal(ordenadas.length, 450); assert.equal(ordenadas[0].id, notas.at(-1).id);
  });
  await t.test('Cronómetros: inicio idempotente, pausa con reloj del servidor y borrado de tramo propio', async () => {
    const iniciado = (await enviar(prefix + '/tiempos', { method: 'POST', body: { categoria: 'PERSONAL' } })).data;
    const repetido = (await enviar(prefix + '/tiempos', { method: 'POST', body: { categoria: 'PERSONAL' } })).data;
    assert.equal(repetido.registro.id, iniciado.registro.id); assert.equal(repetido.creado, false);
    const id = iniciado.registro.id;
    await enviar(prefix + '/tiempos/' + id + '/detener', { jar: luzJar, method: 'POST', body: { version: 1 } }, 404);
    reloj = new Date(reloj.getTime() + 25000);
    const detenido = (await enviar(prefix + '/tiempos/' + id + '/detener', { method: 'POST', body: { version: 1 } })).data;
    assert.equal(detenido.duracion_segundos, 25);
    await enviar(prefix + '/tiempos/' + id, { method: 'DELETE', body: { version: detenido.version } });
    assert.equal((await enviar(dia)).data.tiempos.length, 0);
  });
  await t.test('Suspensión bloquea lecturas y escrituras; reactivación conserva el contenido', async () => {
    await permiso(ana, { estado: 'SUSPENDIDO' });
    assert.equal((await enviar(prefix + '/estado')).data.estado_temporal, 'SUSPENDIDO');
    await enviar(dia, {}, 403);
    await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'No crear', categoria: 'PERSONAL' } }, 403);
    await permiso(ana);
    const actual = (await enviar(dia)).data;
    assert.equal(actual.dia.frase, 'Frase privada'); assert.equal(actual.progreso.porcentaje, 100);
  });
  await t.test('ADMIN con permiso propio usa solo su agenda; no se convierte en lector de agendas ajenas', async () => {
    await permiso(admin);
    const propio = (await enviar(dia, { jar: adminJar })).data;
    assert.equal(propio.tareas.length, 0); assert.equal(propio.notas.length, 0);
    await enviar(prefix + '/tareas/' + tarea.id, { jar: adminJar, method: 'PATCH', body: { version: tarea.version, texto: 'No puede' } }, 404);
    await enviar(prefix + '/notas/' + nota2.id, { jar: adminJar, method: 'DELETE', body: { version: nota2.version } }, 404);
  });
  await t.test('Paths y métodos exactos; filtros repetidos, fechas e IDs inválidos no eluden validación', async () => {
    await enviar(prefix + '/mes?mes=2026-10&mes=2026-11', {}, 422);
    await enviar(prefix + '/mes?mes=2026-10&usuario_id=' + luz.id, {}, 422);
    await enviar(prefix + '/dias/2026-02-30', {}, 422);
    await enviar(prefix + '/tareas/abc', { method: 'DELETE', body: { version: 1 } }, 422);
    await enviar('/api/Agenda/estado', {}, 404); await enviar(prefix + '/estado/', {}, 404);
    await enviar(dia, { method: 'POST', body: {} }, 404);
    await enviar(prefix + '/estado', { method: 'HEAD' }, 405);
    await enviar(prefix + '/tareas/' + tarea.id, { method: 'DELETE', body: { version: tarea.version } });
  });
  await t.test('Logout real revoca la cookie y las respuestas no exponen hashes ni tokens', async () => {
    const detalle = JSON.stringify((await enviar(dia)).value);
    for (const secreto of ['password_hash', 'token_hash', anaJar.cookie, anaJar.csrf]) assert.ok(!detalle.includes(secreto));
    await enviar('/api/auth/logout', { method: 'POST', body: {} });
    await enviar(prefix + '/estado', {}, 401);
  });
});
