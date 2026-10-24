/* Benjamin Orellana - 22/10/2026 - Configuración comercial con HTTP real y SQLite aislado. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { QueryTypes } from 'sequelize';
Object.assign(process.env, { NODE_ENV: 'test', DB_PASSWORD: 'Fixture venta Agenda', FRONTEND_URL: 'http://127.0.0.1:5173',
  ALLOWED_ORIGINS: 'http://127.0.0.1:5173', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', TRUST_PROXY: 'false',
  MP_HABILITADO: 'false', CORREO_HABILITADO: 'false' });
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { hashPassword } = await import('../src/utils/password.utils.js');
const { precioAgenda } = await import('../src/Services/Agenda/agendaVenta.service.js');

test('Precio de Agenda: decimal exacto, sin números flotantes o valores negativos', () => {
  assert.equal(precioAgenda('15000.9'), '15000.90');
  assert.equal(precioAgenda('999999999999.99'), '999999999999.99');
  for (const v of [15000, null, '-1', '15.000,50', '01', '1.001', '1e3', '1000000000000', '', 'NaN']) assert.throws(() => precioAgenda(v));
});

// Benjamin Orellana - 22/10/2026 - Regresión MySQL 3818: CHECK(id=1) requiere un ID sin AUTO_INCREMENT.
test('Configuración única: migración y modelo usan ID explícito compatible con CHECK de MySQL', async () => {
  const sql = await readFile(new URL('../docs/sql/AGENDA_ETAPA5.sql', import.meta.url), 'utf8');
  const definition = sql.match(/^\s*id\s+([^,]+),/m)?.[1];
  assert.ok(definition, 'La migración debe definir la columna id.');
  assert.doesNotMatch(definition, /AUTO_INCREMENT/i);
  assert.match(definition, /BIGINT UNSIGNED NOT NULL/i);
  assert.match(sql, /CONSTRAINT ck_agenda_venta_unica CHECK \(id = 1\)/);
  assert.match(sql, /INSERT INTO agenda_venta_configuracion \(id\) VALUES \(1\)/);
  assert.equal(m.agenda_venta_configuracion.rawAttributes.id.autoIncrement, false);
  const attributes = db.getQueryInterface().queryGenerator.attributesToSQL(m.agenda_venta_configuracion.rawAttributes);
  assert.doesNotMatch(attributes.id, /auto_increment/i);
});

test('Venta de Agenda: configuración administrativa, versiones y conservación de accesos', async t => {
  const adapter = await conectarPrueba(db, { extras: ['agenda.sqlite.sql', 'agenda-venta.sqlite.sql'] });
  const password = 'Agenda Venta QA 2026';
  const hash = await hashPassword(password);
  const admin = await m.usuarios.create({ nombre: 'Juan', email: 'juan@venta.invalid', rol: 'ADMIN', estado: 'ACTIVO', cambiar_password: 0, password_hash: hash });
  const client = await m.crm_clientes.create({ nombre: 'Ana' });
  const student = await m.usuarios.create({ nombre: 'Ana', email: 'ana@venta.invalid', cliente_id: client.id, rol: 'ALUMNO', estado: 'ACTIVO', cambiar_password: 0, password_hash: hash });
  const pending = await m.usuarios.create({ nombre: 'Temporal', email: 'temporal@venta.invalid', rol: 'ADMIN', estado: 'ACTIVO', cambiar_password: 1, password_hash: hash });
  const access = await m.agenda_accesos.create({ usuario_id: student.id, estado: 'ACTIVO', inicio_en: '2026-10-01T12:20:30.456Z', vence_en: '2030-01-01T12:20:30.456Z', otorgado_por: admin.id });
  const day = await m.agenda_dias.create({ usuario_id: student.id, fecha: '2026-10-22', prioridad_1_texto: 'Pilar privado', prioridad_1_cumplida: 1 });
  const task = await m.agenda_tareas.create({ usuario_id: student.id, dia_id: day.id, texto: 'Texto privado que no debe salir', categoria: 'OPERATIVO' });
  const snapshot = JSON.stringify([(await access.reload()).toJSON(), (await day.reload()).toJSON(), (await task.reload()).toJSON()]);
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port, path = '/api/admin/agenda/venta';
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await adapter.close(); });
  let jar, studentJar, pendingJar;
  async function request(url, { method = 'GET', body, headers = {}, cookie = jar, raw } = {}, status = 200) {
    const res = await fetch(base + url, { method, headers: { origin: process.env.FRONTEND_URL,
      ...(cookie ? { cookie: cookie.cookie, 'x-csrf-token': cookie.csrf } : {}),
      ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const json = await res.json(); assert.equal(res.status, status, JSON.stringify(json)); return { res, json, data: json.data };
  }
  async function login(user) {
    const { res, data } = await request('/api/auth/login', { method: 'POST', cookie: null, body: { email: user.email, password } });
    return { cookie: res.headers.get('set-cookie').split(';')[0], csrf: data.csrf_token };
  }
  async function get() { return (await request(path)).data; }
  async function patch(body, status = 200) { return request(path, { method: 'PATCH', body }, status); }
  await t.test('Sesión real, ADMIN y contraseña actualizada; cabeceras libres no autentican', async () => {
    for (const method of ['GET', 'PATCH']) await request(path, { method, cookie: null, ...(method === 'PATCH' ? { body: {} } : {}), headers: { 'x-user-id': String(admin.id), authorization: 'Bearer falso' } }, 401);
    jar = await login(admin); studentJar = await login(student); pendingJar = await login(pending);
    await request(path, { cookie: studentJar }, 403); await request(path, { cookie: pendingJar }, 403);
    await request(path, { cookie: studentJar, method: 'PATCH', body: { version: 1, precio: '15000' } }, 403);
    assert.equal(await m.agenda_accesos.count({ where: { usuario_id: admin.id } }), 0);
  });
  await t.test('Leer configuración no habilita personas; instalación inicial con precio cero y venta pausada', async () => {
    const before = await m.auditoria_eventos.count(), data = await get();
    assert.equal(data.precio, '0.00'); assert.equal(data.venta_habilitada, 0); assert.equal(data.moneda, 'ARS');
    assert.equal(data.acceso_duracion_cantidad, 1); assert.equal(data.acceso_duracion_unidad, 'MESES');
    assert.equal(data.actualizado_por, null); assert.equal(data.version, 1); assert.equal(await m.auditoria_eventos.count(), before);
    assert(!JSON.stringify(data).includes('privado')); assert.equal(await m.agenda_accesos.count(), 1);
  });
  await t.test('CSRF y origen antes del JSON, consultas y campos reservados rechazados', async () => {
    await request(path, { method: 'PATCH', raw: '{', headers: { 'x-csrf-token': 'falso' } }, 403);
    await request(path, { method: 'PATCH', raw: '{', headers: { origin: 'https://ajeno.invalid' } }, 403);
    await request(path, { method: 'PATCH', raw: '{' }, 400);
    for (const body of [{ version: 1, moneda: 'USD' }, { version: 1, actualizado_por: student.id }, { version: 1, usuario_id: student.id }, { version: 1, id: '2' }]) await patch(body, 422);
    await request(path + '?precio=1', {}, 422); await patch({ version: 1 }, 422);
    assert.equal((await get()).version, 1);
  });
  await t.test('Venta requiere precio positivo; importes y duración se guardan juntos con auditoría', async () => {
    await patch({ version: 1, venta_habilitada: 1 }, 422);
    const { data } = await patch({ version: 1, precio: '15000.99', venta_habilitada: 1, acceso_duracion_cantidad: 30, acceso_duracion_unidad: 'DIAS' });
    assert.equal(data.precio, '15000.99'); assert.equal(data.acceso_duracion_cantidad, 30); assert.equal(data.venta_habilitada, 1);
    assert.equal(data.version, 2); assert.equal(data.actualizado_por, String(admin.id));
    const event = await m.auditoria_eventos.findOne({ where: { accion: 'AGENDA_VENTA_CONFIGURADA' } }); assert.ok(event);
    assert(!JSON.stringify(event.detalle).includes('privado'));
    await patch({ version: 2, precio: '0.00' }, 422);
    for (const amount of [15000, '15,00', '-1', '1.001']) await patch({ version: 2, precio: amount }, 422);
  });
  await t.test('Duraciones válidas por días o meses; sin vencimiento usa NULL y cambiar de unidad exige cantidad', async () => {
    for (const body of [{ acceso_duracion_cantidad: 0 }, { acceso_duracion_cantidad: 3651 }, { acceso_duracion_unidad: 'MESES', acceso_duracion_cantidad: 121 }, { acceso_duracion_unidad: 'OTRA' }]) await patch({ version: 2, ...body }, 422);
    let result = await patch({ version: 2, acceso_duracion_unidad: 'SIN_VENCIMIENTO' });
    assert.equal(result.data.acceso_duracion_cantidad, null); assert.equal(result.data.version, 3);
    await patch({ version: 3, acceso_duracion_cantidad: 1 }, 422);
    result = await patch({ version: 3, precio: '20000.00' }); assert.equal(result.data.acceso_duracion_cantidad, null);
    await patch({ version: 4, acceso_duracion_unidad: 'MESES' }, 422);
    result = await patch({ version: 4, acceso_duracion_unidad: 'MESES', acceso_duracion_cantidad: 3 });
    assert.equal(result.data.acceso_duracion_cantidad, 3); assert.equal(result.data.version, 5);
  });
  await t.test('Edición vieja no pisa cambios; guardar el mismo valor no incrementa ni duplica auditoría', async () => {
    await patch({ version: 4, precio: '10.00' }, 409);
    const count = await m.auditoria_eventos.count(); const { data } = await patch({ version: 5, precio: '20000.00' });
    assert.equal(data.version, 5); assert.equal(await m.auditoria_eventos.count(), count);
  });
  await t.test('Error de auditoría revierte precio y versión; pausa comercial conserva los permisos personales', async () => {
    const original = m.auditoria_eventos.create;
    m.auditoria_eventos.create = async () => { throw new Error('Detalle interno que no debe salir'); };
    try { const { json } = await patch({ version: 5, precio: '25000.00' }, 500); assert(!JSON.stringify(json).includes('Detalle interno')); }
    finally { m.auditoria_eventos.create = original; }
    assert.equal((await get()).precio, '20000.00'); assert.equal((await get()).version, 5);
    const { data } = await patch({ version: 5, venta_habilitada: 0, precio: '0.00' }); assert.equal(data.venta_habilitada, 0); assert.equal(data.version, 6);
    assert.equal(JSON.stringify([(await access.reload()).toJSON(), (await day.reload()).toJSON(), (await task.reload()).toJSON()]), snapshot);
  });
  await t.test('Restricciones de DB y semilla repetible impiden otra configuración y conservan los valores', async () => {
    for (const values of [{ id: '2' }, { precio: '-1' }, { venta_habilitada: 1, precio: '0' }, { acceso_duracion_unidad: 'DIAS', acceso_duracion_cantidad: null }]) {
      if (values.id) await assert.rejects(() => m.agenda_venta_configuracion.create(values));
      else await assert.rejects(() => m.agenda_venta_configuracion.update(values, { where: { id: '1' } }));
    }
    await db.query('INSERT OR IGNORE INTO agenda_venta_configuracion(id) VALUES(1)'); assert.equal((await get()).version, 6);
    const mysql = await readFile(new URL('../docs/sql/AGENDA_ETAPA5.sql', import.meta.url), 'utf8');
    const fixture = await readFile(new URL('./fixtures/agenda-venta.sqlite.sql', import.meta.url), 'utf8');
    const names = sql => [...sql.matchAll(/CONSTRAINT (\w+)/g)].map(m => m[1]); assert.deepEqual(names(mysql), names(fixture));
    const columns = await db.query('PRAGMA table_info(agenda_venta_configuracion)', { type: QueryTypes.SELECT });
    assert.deepEqual(columns.map(c => c.name), Object.keys(m.agenda_venta_configuracion.rawAttributes));
  });
  await t.test('Sesión revocada bloquea nuevas lecturas y escrituras', async () => {
    await m.usuarios_sesiones.update({ revocada_en: new Date() }, { where: { usuario_id: admin.id } });
    await request(path, {}, 401); await request(path, { method: 'PATCH', body: { version: 6, precio: '100.00' } }, 401);
  });
});
