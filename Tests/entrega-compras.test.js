/* Benjamin Orellana - 19/10/2026 - HTTP real, SQL aislado y videos temporales; sin pagos externos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
process.env.NODE_ENV = 'test'; process.env.COOKIE_SECURE = 'false'; process.env.MP_HABILITADO = 'false';
process.env.FRONTEND_URL = 'http://127.0.0.1:5173';
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:5173';
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { hashToken, tokenAleatorio, tokenCsrf } = await import('../src/utils/password.utils.js');
const { fechaGuardada } = await import('../src/Services/Acceso/permisoAcceso.service.js');
const { entregarCompra, vencimientoCompra } = await import('../src/Services/Compra/entregaCompra.service.js');

test('Duración congelada: meses argentinos, bisiestos, cambio de mes UTC y límites', () => {
  for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
    const previous = process.env.TZ; process.env.TZ = tz;
    try {
      assert.equal(vencimientoCompra(new Date('2028-02-01T01:12:13.456Z'), 1, 'MESES').toISOString(), '2028-03-01T01:12:13.456Z');
      assert.equal(vencimientoCompra(new Date('2027-02-01T01:12:13.456Z'), 1, 'MESES').toISOString(), '2027-03-01T01:12:13.456Z');
      assert.equal(vencimientoCompra(new Date('2028-02-29T20:00:00.000Z'), 12, 'MESES').toISOString(), '2029-02-28T20:00:00.000Z');
      assert.equal(vencimientoCompra(new Date('2026-12-31T23:59:59.999Z'), 1, 'DIAS').toISOString(), '2027-01-01T23:59:59.999Z');
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  }
  for (const [q, u] of [[0, 'MESES'], [121, 'MESES'], [3651, 'DIAS'], ['1', 'MESES'], [1, 'AÑOS']]) {
    assert.throws(() => vencimientoCompra(new Date(), q, u), error => error.code === 'COMPRA_DURACION_INVALIDA');
  }
});
test('Entrega de compra: ambas sesiones, pago verificado e idempotencia de accesos', async t => {
  const originalNow = Date.now; let tick = originalNow(); Date.now = () => tick;
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'factore-entrega-')); process.env.STORAGE_ROOT = root;
  await mkdir(path.join(root, 'videos'));
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    Date.now = originalNow; await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port, origin = process.env.FRONTEND_URL;
  const admin = await m.usuarios.create({ nombre: 'Juan', email: 'juan@entrega.invalid', rol: 'ADMIN', estado: 'ACTIVO' });
  async function alumno(nombre) {
    const cliente = await m.crm_clientes.create({ nombre });
    const user = await m.usuarios.create({ nombre, email: nombre.toLowerCase() + '@entrega.invalid', rol: 'ALUMNO', estado: 'ACTIVO', cliente_id: cliente.id });
    return { user, cliente };
  }
  const a = await alumno('Alumno'), b = await alumno('Otro');
  async function sesion(user) {
    const raw = tokenAleatorio(), row = await m.usuarios_sesiones.create({ usuario_id: user.id, token_hash: hashToken(raw), vence_en: new Date(Date.now() + 3600000) });
    return { raw, row, cookie: 'factore_sid=' + raw, csrf: tokenCsrf(raw) };
  }
  const sid = await sesion(a.user), otroSid = await sesion(b.user), adminSid = await sesion(admin);
  async function contenido(titulo, existe = true) {
    const uuid = randomUUID(), relative = 'videos/' + uuid + '.mp4';
    if (existe) await writeFile(path.join(root, relative), 'video');
    const video = await m.archivos.create({ uuid, tipo: 'VIDEO', estado: 'DISPONIBLE', ruta_relativa: relative,
      nombre_guardado: uuid + '.mp4', nombre_original: 'clase.mp4', extension: 'mp4', mime_type: 'video/mp4',
      tamanio_bytes: '5', sha256: 'PRIVADO', subido_por: admin.id });
    const curso = await m.cursos.create({ titulo, slug: titulo, estado: 'PUBLICADO', visible_catalogo: 1,
      venta_online_habilitada: 1, precio: '350000.00', creado_por: admin.id });
    const modulo = await m.curso_modulos.create({ curso_id: curso.id, titulo: 'Módulo', estado: 'ACTIVO' });
    const leccion = await m.curso_lecciones.create({ curso_id: curso.id, modulo_id: modulo.id,
      titulo: 'Clase', estado: 'PUBLICADA', video_archivo_id: video.id });
    return { curso, modulo, leccion };
  }
  const c = await contenido('motor'), otro = await contenido('kit');
  async function request(url, { method = 'GET', cookie, csrf, compraCsrf, body, origen = origin } = {}) {
    const res = await fetch(base + url, { method, headers: { ...(origen ? { Origin: origen } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(compraCsrf ? { 'X-Compra-CSRF': compraCsrf } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
  }
  let pagoId = 100000;
  async function compra({ email = a.user.email, ids = [String(c.curso.id)], pagada = true } = {}) {
    tick += 61000; // Ventana del rate limit aislada por compra, sin deshabilitar su middleware.
    const ref = randomUUID(), url = '/api/checkout/navegador/compras/' + ref;
    const prepared = await request(url + '/sesion', { method: 'POST', body: {} }); assert.equal(prepared.status, 200);
    const cookie = prepared.headers.get('set-cookie').split(';')[0], raw = cookie.split('=')[1];
    const s = await request(url + '/sesion', { cookie }); assert.equal(s.status, 200);
    const csrf = s.body.data.csrf_token;
    const created = await request(url, { method: 'POST', cookie, csrf, body: { referencia: ref, nombre: 'Comprador', email, curso_ids: ids } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const row = await m.compras.findOne({ where: { referencia: ref } });
    if (pagada) {
      const now = new Date(); await row.update({ estado: 'PAGADA', pagada_en: now });
      await m.compra_pagos.create({ compra_id: row.id, mp_pago_id: String(++pagoId), estado: 'approved',
        validacion: 'VALIDADO', importe: row.total, moneda: 'ARS', mp_actualizado_en: now, aprobado_en: now, verificado_en: now });
    }
    return { ref, cookie, csrf, raw, row, ids };
  }
  async function vincular(p, { cuenta = sid, cookie = p.cookie + '; ' + cuenta.cookie, csrf = cuenta.csrf,
    compraCsrf = p.csrf, body = {}, origen = origin } = {}) {
    return request('/api/campus/compras/' + p.ref + '/vincular', { method: 'POST', cookie, csrf, compraCsrf, body, origen });
  }
  let primera, acceso, recibo;
  await t.test('Conocer la referencia, email o una sola sesión no asigna; dos CSRF distintos obligatorios', async () => {
    primera = await compra();
    assert.equal((await vincular(primera, { cookie: primera.cookie })).status, 401);
    assert.equal((await vincular(primera, { cookie: sid.cookie })).status, 401);
    assert.equal((await vincular(primera, { csrf: null })).status, 403);
    assert.equal((await vincular(primera, { compraCsrf: null })).status, 403);
    assert.equal(await m.curso_accesos.count(), 0);
  });
  await t.test('Asignación completa con duración congelada, historial y recibo sin secretos', async () => {
    await c.curso.update({ acceso_duracion_cantidad: 12 });
    const result = await vincular(primera); assert.equal(result.status, 200, JSON.stringify(result.body));
    recibo = result.body.data; assert.equal(recibo.reutilizada, false);
    acceso = await m.curso_accesos.findOne({ where: { usuario_id: a.user.id, curso_id: c.curso.id } });
    assert.equal(acceso.alcance, 'COMPLETO'); assert.equal(acceso.estado, 'ACTIVO');
    assert.equal(fechaGuardada(acceso.vence_en).toISOString(), vencimientoCompra(fechaGuardada(acceso.inicio_en), 1, 'MESES').toISOString());
    assert.equal(String(acceso.asignado_por), String(a.user.id));
    assert.equal(await m.curso_accesos_historial.count(), 1);
    assert.equal(await m.auditoria_eventos.count({ where: { accion: 'COMPRA_ENTREGADA' } }), 1);
    assert.ok(!JSON.stringify(result.body).includes(primera.raw)); assert.ok(!JSON.stringify(result.body).includes('password_hash'));
    assert.equal((await m.compras.findByPk(primera.row.id)).usuario_id, a.user.id);
  });
  await t.test('CSRF y cuenta ajenos, cuerpo libre y origen ausente no permiten entregar', async () => {
    const p = await compra();
    for (const options of [{ csrf: 'falso' }, { compraCsrf: 'falso' }, { origen: null }, { origen: 'https://ajeno.invalid' },
      { cuerpo: true, body: { usuario_id: String(b.user.id) } }, { cuenta: adminSid }, { cuenta: otroSid }]) {
      const result = await vincular(p, options); assert.ok([401, 403, 409, 422].includes(result.status), JSON.stringify(result.body));
    }
    assert.equal((await m.compras.findByPk(p.row.id)).usuario_id, null);
    const fake = randomBytes(32).toString('hex'), wrong = p.cookie.replace(p.raw, fake);
    assert.equal((await vincular(p, { cookie: wrong + '; ' + sid.cookie })).status, 403);
    assert.equal((await vincular(p, { cookie: wrong + '; ' + sid.cookie,
      compraCsrf: createHmac('sha256', fake).update('factore:checkout:csrf:v1:' + p.ref).digest('hex') })).status, 404);
    const other = await vincular(primera, { cuenta: otroSid }); assert.equal(other.status, 409);
  });
  await t.test('Pendiente, importe incoherente, reintegro o revisión nunca habilitan accesos', async () => {
    const pending = await compra({ pagada: false }); assert.equal((await vincular(pending)).status, 409);
    for (const patch of [{ validacion: 'REVISION', motivo_revision: 'PRUEBA' }, { importe: '1.00' }, { importe_reintegrado: '1.00' }, { estado: 'refunded' }]) {
      const p = await compra(); await m.compra_pagos.update(patch, { where: { compra_id: p.row.id } });
      assert.equal((await vincular(p)).status, 409); assert.equal((await m.compras.findByPk(p.row.id)).usuario_id, null);
    }
  });
  await t.test('Una segunda compra renueva desde el vencimiento; repetir la primera conserva progreso y no suma meses', async () => {
    await c.curso.update({ acceso_duracion_cantidad: 1 });
    const progreso = await m.leccion_progreso.create({ usuario_id: a.user.id, curso_id: c.curso.id,
      leccion_id: c.leccion.id, estado: 'COMPLETADA', posicion_segundos: 13, iniciada_en: new Date(), ultimo_acceso_en: new Date(), completada_en: new Date() });
    const oldEnd = fechaGuardada(acceso.vence_en), p = await compra();
    const result = await vincular(p); assert.equal(result.status, 200); assert.equal(result.body.data.reutilizada, false);
    await acceso.reload(); const newEnd = fechaGuardada(acceso.vence_en).toISOString();
    assert.equal(newEnd, vencimientoCompra(oldEnd, 1, 'MESES').toISOString());
    const again = await vincular(primera); assert.equal(again.status, 200); assert.deepEqual(again.body.data.cursos, recibo.cursos);
    await acceso.reload(); assert.equal(fechaGuardada(acceso.vence_en).toISOString(), newEnd);
    await progreso.reload(); assert.equal(progreso.estado, 'COMPLETADA'); assert.equal(progreso.posicion_segundos, 13);
  });
  await t.test('Suspensión, revocación, selección y excepciones requieren revisión; repetir entrega nunca restaura permisos', async () => {
    for (const estado of ['SUSPENDIDO', 'REVOCADO']) {
      await acceso.update({ estado }); const p = await compra();
      assert.equal((await vincular(p)).status, 409);
      assert.equal((await vincular(primera)).status, 200); await acceso.reload(); assert.equal(acceso.estado, estado);
    }
    await acceso.update({ estado: 'ACTIVO', alcance: 'SELECCION' }); assert.equal((await vincular(await compra())).status, 409);
    await acceso.update({ alcance: 'COMPLETO' });
    const exception = await m.curso_acceso_lecciones.create({ acceso_id: acceso.id, curso_id: c.curso.id, leccion_id: c.leccion.id, estado: 'BLOQUEADA' });
    assert.equal((await vincular(await compra())).status, 409); await exception.destroy();
  });
  await t.test('Acceso vencido comienza un período desde ahora; varios cursos quedan en una sola entrega', async () => {
    const oldStart = new Date('2020-01-01T03:00:00.000Z');
    await acceso.update({ inicio_en: oldStart, vence_en: new Date('2020-02-01T03:00:00.000Z') });
    const extra = await contenido('curso-extra');
    const p = await compra({ ids: [String(c.curso.id), String(extra.curso.id)] });
    const result = await vincular(p); assert.equal(result.status, 200); assert.equal(result.body.data.cursos.length, 2);
    await acceso.reload(); assert.equal(fechaGuardada(acceso.inicio_en).toISOString(), oldStart.toISOString());
    assert.ok(fechaGuardada(acceso.vence_en) > new Date());
    const otroAcceso = await m.curso_accesos.findOne({ where: { usuario_id: a.user.id, curso_id: extra.curso.id } });
    assert.ok(otroAcceso);
  });
  await t.test('Un acceso ilimitado se conserva; falla de auditoría revierte compra e historial', async () => {
    await acceso.update({ vence_en: null }); const p = await compra(), before = await m.curso_accesos_historial.count();
    const result = await vincular(p); assert.equal(result.status, 200); assert.equal(result.body.data.cursos[0].accion, 'CONSERVADO');
    await acceso.reload(); assert.equal(acceso.vence_en, null); assert.equal(await m.curso_accesos_historial.count(), before);
    const failing = await compra({ ids: [String(otro.curso.id)] }), original = m.auditoria_eventos.create;
    m.auditoria_eventos.create = async function (value, options) { if (value.accion === 'COMPRA_ENTREGADA') throw new Error('AUDITORIA_FALLIDA'); return original.call(this, value, options); };
    try { assert.equal((await vincular(failing)).status, 500); } finally { m.auditoria_eventos.create = original; }
    assert.equal((await m.compras.findByPk(failing.row.id)).usuario_id, null);
    assert.equal(await m.curso_accesos.count({ where: { usuario_id: a.user.id, curso_id: otro.curso.id } }), 0);
    assert.equal(await m.curso_accesos_historial.count(), before);
    assert.equal((await vincular(failing)).status, 200);
  });
  await t.test('Archivo ausente en el segundo curso revierte toda la entrega; sin asignaciones parciales', async () => {
    const good = await contenido('otro-motor'), bad = await contenido('sin-video', false);
    const p = await compra({ ids: [String(good.curso.id), String(bad.curso.id)] }), before = await m.curso_accesos.count();
    assert.equal((await vincular(p)).status, 422);
    assert.equal(await m.curso_accesos.count(), before); assert.equal((await m.compras.findByPk(p.row.id)).usuario_id, null);
  });
  await t.test('Sesión revocada después del middleware y cuenta bloqueada se revalidan dentro de la transacción', async () => {
    const p = await compra();
    await sid.row.update({ revocada_en: new Date() });
    await assert.rejects(entregarCompra({ params: { referencia: p.ref }, compraToken: p.raw, user: { id: a.user.id },
      session: { id: sid.row.id }, sessionToken: sid.raw }), error => error.code === 'SESION_INVALIDA');
    await a.user.update({ estado: 'BLOQUEADO' }); assert.equal((await vincular(p)).status, 401);
    assert.equal((await m.compras.findByPk(p.row.id)).usuario_id, null);
  });
});
