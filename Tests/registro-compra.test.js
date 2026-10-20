/* Benjamin Orellana - 18/10/2026 - Registro HTTP y activación de un solo uso; SMTP aislado sin correos externos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nodemailer from 'nodemailer';
process.env.NODE_ENV = 'test'; process.env.COOKIE_SECURE = 'false'; process.env.MP_HABILITADO = 'false';
process.env.FRONTEND_URL = 'http://127.0.0.1:5173'; process.env.ALLOWED_ORIGINS = process.env.FRONTEND_URL;
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { hashPassword, tokenAleatorio, hashToken } = await import('../src/utils/password.utils.js');
const { emitirToken } = await import('../src/Services/Usuario/auth.service.js');
const { configCorreoCuenta, enviarCorreoCuenta } = await import('../src/Services/Usuario/correoCuenta.service.js');

function habilitarCorreo() {
  Object.assign(process.env, { CORREO_HABILITADO: 'true', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '465',
    SMTP_USER: 'cuentas@example.invalid', SMTP_PASSWORD: 'SECRETO_SMTP_DE_PRUEBA', SMTP_FROM: 'cuentas@example.invalid' });
}
test('Registro de compra: verificar email antes de activar y mantener intactas las cuentas existentes', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'factore-registro-')); process.env.STORAGE_ROOT = root; await mkdir(path.join(root, 'videos'));
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const originalTransport = nodemailer.createTransport, mails = [], configs = []; let fallarCorreo = false;
  nodemailer.createTransport = options => { configs.push(options); return {
    async sendMail(mail) { if (fallarCorreo) throw new Error('ERROR_CON_DATOS_PRIVADOS'); mails.push(mail); return { accepted: [mail.to.address], rejected: [] }; }, close() {} }; };
  t.after(async () => { nodemailer.createTransport = originalTransport; server.closeAllConnections();
    await new Promise(resolve => server.close(resolve)); await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port, origin = process.env.FRONTEND_URL;
  const admin = await m.usuarios.create({ nombre: 'Juan', email: 'juan@registro.invalid', rol: 'ADMIN', estado: 'ACTIVO' });
  const uuid = randomUUID(); await writeFile(path.join(root, 'videos', uuid + '.mp4'), 'video');
  const video = await m.archivos.create({ uuid, tipo: 'VIDEO', estado: 'DISPONIBLE', nombre_original: 'clase.mp4', nombre_guardado: uuid + '.mp4',
    ruta_relativa: 'videos/' + uuid + '.mp4', extension: 'mp4', mime_type: 'video/mp4', tamanio_bytes: '5', sha256: 'PRIVADO', subido_por: admin.id });
  const curso = await m.cursos.create({ titulo: 'Motor', slug: 'motor', estado: 'PUBLICADO', visible_catalogo: 1, venta_online_habilitada: 1,
    precio: '350000.00', creado_por: admin.id });
  const modulo = await m.curso_modulos.create({ curso_id: curso.id, titulo: 'Inicio', estado: 'ACTIVO' });
  await m.curso_lecciones.create({ curso_id: curso.id, modulo_id: modulo.id, titulo: 'Lección', estado: 'PUBLICADA', video_archivo_id: video.id });
  async function request(url, { method = 'GET', cookie, csrf, compraCsrf, body, origen = origin } = {}) {
    const res = await fetch(base + url, { method, headers: { ...(origen ? { Origin: origen } : {}), ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(compraCsrf ? { 'X-Compra-CSRF': compraCsrf } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, headers: res.headers, body: await res.json() };
  }
  let pagoId = 200000;
  async function compra(email, pagada = true) {
    const ref = randomUUID(), prefix = '/api/checkout/navegador/compras/' + ref;
    const prep = await request(prefix + '/sesion', { method: 'POST', body: {} }); assert.equal(prep.status, 200);
    const cookie = prep.headers.get('set-cookie').split(';')[0], s = await request(prefix + '/sesion', { cookie });
    const csrf = s.body.data.csrf_token;
    const cr = await request(prefix, { method: 'POST', body: { referencia: ref, nombre: 'Nueva alumna', email, curso_ids: [String(curso.id)] }, cookie, csrf });
    assert.equal(cr.status, 201, JSON.stringify(cr.body)); const row = await m.compras.findOne({ where: { referencia: ref } });
    if (pagada) { const now = new Date(); await row.update({ estado: 'PAGADA', pagada_en: now });
      await m.compra_pagos.create({ compra_id: row.id, mp_pago_id: String(++pagoId), estado: 'approved', validacion: 'VALIDADO', importe: row.total,
        moneda: 'ARS', mp_actualizado_en: now, aprobado_en: now, verificado_en: now }); }
    return { ref, prefix, cookie, csrf, row };
  }
  const registrar = (p, options = {}) => request(p.prefix + '/registrar-cuenta', { method: 'POST', cookie: p.cookie, csrf: p.csrf, body: {}, ...options });
  const obtenerLink = mail => new URL(mail.text.match(/https?:\/\/\S+\/activar-cuenta\?\S+/)[0]);
  let p, user, link, login;
  await t.test('Sin SMTP, cookie, origen, CSRF o pago verificado no crea cuentas ni envía correo', async () => {
    p = await compra('nueva@registro.invalid'); process.env.CORREO_HABILITADO = 'false';
    const missing = await registrar(p); assert.equal(missing.status, 503); assert.equal(missing.body.error.code, 'CORREO_NO_CONFIGURADO');
    habilitarCorreo();
    for (const options of [{ cookie: null }, { csrf: null }, { origen: null }, { body: { password: 'LIBRE' } }, { body: { email: admin.email } }]) {
      const r = await registrar(p, options); assert.ok([401, 403, 422].includes(r.status));
    }
    const pending = await compra('pendiente@registro.invalid', false); assert.equal((await registrar(pending)).status, 409);
    assert.equal(await m.usuarios.count(), 1); assert.equal(await m.crm_clientes.count(), 0); assert.equal(mails.length, 0);
  });
  await t.test('Crear desde la compra genera ficha y cuenta pendiente; token solo en email y hash en DB', async () => {
    const result = await registrar(p); assert.equal(result.status, 202, JSON.stringify(result.body));
    assert.deepEqual(result.body.data, { solicitud_recibida: true }); assert.equal(mails.length, 1);
    user = await m.usuarios.scope('conHash').findOne({ where: { email: 'nueva@registro.invalid' } });
    assert.equal(user.estado, 'PENDIENTE'); assert.equal(user.rol, 'ALUMNO'); assert.equal(user.password_hash, null); assert.ok(user.cliente_id);
    assert.equal(await m.curso_accesos.count(), 0); assert.equal((await m.compras.findByPk(p.row.id)).usuario_id, null);
    link = obtenerLink(mails[0]); assert.equal(link.searchParams.get('compra'), p.ref);
    const token = link.searchParams.get('token'), stored = await m.usuarios_tokens.scope('conHash').findOne({ where: { usuario_id: user.id } });
    assert.equal(stored.token_hash, createHash('sha256').update(token).digest('hex')); assert.notEqual(stored.token_hash, token);
    assert.ok(!JSON.stringify(result.body).includes(token)); assert.ok(!JSON.stringify(result.body).includes(link.href));
    const audits = await m.auditoria_eventos.findAll(); assert.ok(!JSON.stringify(audits).includes(token));
    assert.equal(configs[0].secure, true); assert.equal(configs[0].tls.rejectUnauthorized, true); assert.equal(configs[0].debug, false);
    const loginPending = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'Clave elegida por comprador 2026' } });
    assert.equal(loginPending.status, 401);
  });
  await t.test('Recargar/doble clic no emite otro enlace, no duplica cuenta ni invalida el email anterior', async () => {
    const result = await registrar(p); assert.equal(result.status, 202); assert.equal(mails.length, 1);
    assert.equal(await m.usuarios.count(), 2); assert.equal(await m.usuarios_tokens.count(), 1);
    const count = await m.auditoria_eventos.count({ where: { accion: 'COMPRA_CORREO_SOLICITADO' } }); assert.equal(count, 1);
  });
  await t.test('Activar exige token y contraseña; solo entonces login y asignación del curso', async () => {
    // Benjamin Orellana - 19/10/2026 - La activación acepta ocho caracteres y no consume el token ante claves inválidas.
    const password = 'Curso#26', token = link.searchParams.get('token');
    for (const invalida of ['Clave12', 'x'.repeat(61)]) {
      const rechazo = await request('/api/auth/activar', { method: 'POST', body: { token, password: invalida } });
      assert.equal(rechazo.status, 422);
    }
    const fail = await request('/api/auth/activar', { method: 'POST', body: { token: tokenAleatorio(), password } }); assert.equal(fail.status, 400);
    const activated = await request('/api/auth/activar', { method: 'POST', body: { token, password } }); assert.equal(activated.status, 200);
    const reused = await request('/api/auth/activar', { method: 'POST', body: { token, password } }); assert.equal(reused.status, 400);
    const signed = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password } }); assert.equal(signed.status, 200);
    login = { cookie: signed.headers.get('set-cookie').split(';')[0], csrf: signed.body.data.csrf_token };
    const delivered = await request('/api/campus/compras/' + p.ref + '/vincular', { method: 'POST', cookie: p.cookie + '; ' + login.cookie,
      csrf: login.csrf, compraCsrf: p.csrf, body: {} }); assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
    assert.equal(delivered.body.data.cursos[0].accion, 'ASIGNADO'); assert.equal(await m.curso_accesos.count(), 1);
  });
  await t.test('Email de cuenta existente activa/pendiente/admin no regenera tokens ni cambia rol, ficha, password o sesiones', async () => {
    const cliente = await m.crm_clientes.create({ nombre: 'Ficha previa' });
    const pending = await m.usuarios.create({ nombre: 'Pendiente manual', email: 'manual@registro.invalid', rol: 'ALUMNO', cliente_id: cliente.id });
    const manualToken = await db.transaction(tx => emitirToken(pending, tx, 'ACTIVACION'));
    const raw = tokenAleatorio(); await m.usuarios_sesiones.create({ usuario_id: user.id, token_hash: hashToken(raw), vence_en: new Date(Date.now() + 3600000) });
    const before = JSON.stringify(await m.usuarios.scope('conHash').findAll()), tokens = JSON.stringify(await m.usuarios_tokens.scope('conHash').findAll());
    for (const email of [user.email, pending.email, admin.email]) {
      const r = await registrar(await compra(email)); assert.equal(r.status, 202); assert.deepEqual(r.body.data, { solicitud_recibida: true });
      assert.ok(!mails.at(-1).text.includes('/activar-cuenta')); assert.ok(!mails.at(-1).text.includes(manualToken.token));
    }
    assert.equal(JSON.stringify(await m.usuarios.scope('conHash').findAll()), before);
    assert.equal(JSON.stringify(await m.usuarios_tokens.scope('conHash').findAll()), tokens);
    assert.equal(await m.usuarios_sesiones.count({ where: { token_hash: hashToken(raw), revocada_en: null } }), 1);
  });
  await t.test('Error SMTP no expone detalles; reenvío posterior rota solo el token pendiente de esta compra', async () => {
    const f = await compra('fallo@registro.invalid'); fallarCorreo = true;
    const failed = await registrar(f); assert.equal(failed.status, 503); assert.equal(failed.body.error.code, 'CORREO_NO_ENVIADO');
    assert.ok(!JSON.stringify(failed.body).includes('ERROR_CON_DATOS')); fallarCorreo = false;
    const pending = await m.usuarios.findOne({ where: { email: 'fallo@registro.invalid' } });
    const old = await m.usuarios_tokens.findOne({ where: { usuario_id: pending.id } });
    await m.auditoria_eventos.update({ creado_en: new Date(Date.now() - 61000) }, { where: { entidad: 'compras', entidad_id: f.row.id, accion: 'COMPRA_CORREO_SOLICITADO' } });
    const retry = await registrar(f); assert.equal(retry.status, 202); await old.reload(); assert.ok(old.revocado_en);
    assert.equal(await m.usuarios.count({ where: { email: pending.email } }), 1);
    const latest = obtenerLink(mails.at(-1)); assert.notEqual(latest.searchParams.get('token'), old.token_hash);
  });
  await t.test('Auditoría fallida revierte ficha, usuario y token; no inicia SMTP', async () => {
    const f = await compra('rollback@registro.invalid'), original = m.auditoria_eventos.create, before = mails.length;
    m.auditoria_eventos.create = async function (value, options) { if (value.accion === 'COMPRA_CUENTA_CREADA') throw new Error('PRUEBA'); return original.call(this, value, options); };
    try { assert.equal((await registrar(f)).status, 500); } finally { m.auditoria_eventos.create = original; }
    assert.equal(mails.length, before); assert.equal(await m.usuarios.count({ where: { email: 'rollback@registro.invalid' } }), 0);
    assert.equal(await m.crm_clientes.count({ where: { email: 'rollback@registro.invalid' } }), 0);
  });
  await t.test('TLS obligatorio y enlaces del frontend exacto; no admite destinatarios múltiples ni cabeceras', async () => {
    for (const [key, value] of [['SMTP_PORT', '25'], ['SMTP_FROM', 'a@example.invalid,b@example.invalid'], ['SMTP_HOST', 'smtp.invalid\r\nX']]) {
      const old = process.env[key]; process.env[key] = value; assert.throws(configCorreoCuenta, error => error.code === 'CORREO_NO_CONFIGURADO'); process.env[key] = old;
    }
    await assert.rejects(enviarCorreoCuenta({ destinatario: 'a@b.invalid', enlace: 'https://ajeno.invalid/activar-cuenta', activacion: true }));
    await assert.rejects(enviarCorreoCuenta({ destinatario: 'a@b.invalid\r\nBcc:x@y.invalid', enlace: origin + '/login', activacion: false }));
  });
});
