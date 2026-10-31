/* Benjamin Orellana - 30/10/2026 - Campus HTTP real y diplomas aislados; no usa MySQL DESA ni emite a alumnos reales. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
Object.assign(process.env, { NODE_ENV: 'test', DB_PASSWORD: 'Certificados aislados', FRONTEND_URL: 'http://127.0.0.1:5173',
  ALLOWED_ORIGINS: 'http://127.0.0.1:5173', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', TRUST_PROXY: 'false', MP_HABILITADO: 'false', CORREO_HABILITADO: 'false' });
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { crearApp } = await import('../app.js');
const { hashPassword } = await import('../src/utils/password.utils.js');
const { generarDiploma } = await import('../src/Services/Certificado/diplomaPdf.service.js');

test('Certificados: servidor decide completitud total, emisión única y PDF privado del registro original', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const password = 'CertificadosPrueba2026!', password_hash = await hashPassword(password);
  const admin = await m.usuarios.create({ nombre: 'Juan', email: 'admin@certificados.invalid', rol: 'ADMIN', estado: 'ACTIVO', password_hash });
  async function cuenta(nombre) {
    const cliente = await m.crm_clientes.create({ nombre });
    return m.usuarios.create({ nombre, email: nombre.toLowerCase() + '@certificados.invalid', cliente_id: cliente.id, estado: 'ACTIVO', rol: 'ALUMNO', password_hash });
  }
  const alumno = await cuenta('Benjamin'), otro = await cuenta('Lucia');
  const video = await m.archivos.create({ uuid: randomUUID(), tipo: 'VIDEO', nombre_original: 'clase.mp4', nombre_guardado: 'clase.mp4',
    ruta_relativa: 'videos/clase.mp4', mime_type: 'video/mp4', extension: 'mp4', tamanio_bytes: '100', estado: 'DISPONIBLE', subido_por: admin.id });
  async function contenido(user = alumno, config = {}) {
    const curso = await m.cursos.create({ titulo: 'Motor de Resultados', slug: randomUUID(), estado: 'PUBLICADO', creado_por: admin.id,
      certificado_habilitado: 1, certificado_carga_horaria: '12.50', ...config });
    const modulo = await m.curso_modulos.create({ curso_id: curso.id, titulo: 'Módulo activo' });
    const lecciones = [];
    for (const titulo of ['Primera', 'Segunda', 'Tercera']) lecciones.push(await m.curso_lecciones.create({ curso_id: curso.id,
      modulo_id: modulo.id, titulo, estado: 'PUBLICADA', video_archivo_id: video.id }));
    const acceso = await m.curso_accesos.create({ usuario_id: user.id, curso_id: curso.id, asignado_por: admin.id, estado: 'ACTIVO',
      alcance: 'COMPLETO', inicio_en: '2020-01-01T00:00:00.000Z', vence_en: '2099-01-01T00:00:00.000Z' });
    return { curso, modulo, lecciones, acceso, user };
  }
  async function completar(data, lecciones = data.lecciones) {
    for (const l of lecciones) await m.leccion_progreso.create({ usuario_id: data.user.id, curso_id: data.curso.id, leccion_id: l.id,
      estado: 'COMPLETADA', completada_en: '2026-01-01T00:00:00.000Z', posicion_segundos: 30 });
  }
  const principal = await contenido(), ajeno = await contenido(otro);
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await adapter.close(); });
  let jar, adminJar, otroJar;
  const path = data => '/campus/cursos/' + data.curso.id + '/certificado';
  async function send(path, { cookie = jar, method = 'GET', body, headers = {} } = {}) {
    return fetch(base + '/api' + path, { method, headers: { origin: process.env.FRONTEND_URL,
      ...(cookie ? { cookie: cookie.cookie, 'x-csrf-token': cookie.csrf } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function json(path, options = {}, status = 200) {
    const res = await send(path, options), value = await res.json(); assert.equal(res.status, status, JSON.stringify(value)); return value.data;
  }
  async function login(user) {
    const res = await send('/auth/login', { cookie: null, method: 'POST', body: { email: user.email, password } }), value = await res.json();
    assert.equal(res.status, 200, JSON.stringify(value)); return { cookie: res.headers.get('set-cookie').split(';')[0], csrf: value.data.csrf_token };
  }
  const emitir = (data, options = {}, status = 201) => json(path(data), { method: 'POST', body: {}, ...options }, status);
  await t.test('Cookie, ALUMNO, CSRF y origen obligatorios; sin nombres, fechas o IDs libres', async () => {
    jar = await login(alumno); adminJar = await login(admin); otroJar = await login(otro);
    for (const suffix of ['', '/pdf']) {
      await json(path(principal) + suffix, { cookie: null, headers: { authorization: 'Bearer libre', 'x-user-id': alumno.id } }, 401);
      await json(path(principal) + suffix, { cookie: adminJar }, 403);
    }
    await emitir(principal, { cookie: null }, 401); await emitir(principal, { cookie: adminJar }, 403);
    await emitir(principal, { headers: { 'x-csrf-token': 'falso' } }, 403);
    const sinOrigen = await fetch(base + '/api' + path(principal), { method: 'POST', headers: { cookie: jar.cookie, 'x-csrf-token': jar.csrf, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(sinOrigen.status, 403); assert.equal((await sinOrigen.json()).error.code, 'ORIGEN_REQUERIDO');
    await emitir(principal, { headers: { origin: 'https://ajeno.invalid' } }, 403);
    await emitir(principal, { body: { alumno_nombre: 'Otra persona', carga_horaria: '999', emitido_en: '2020-01-01' } }, 422);
    await json(path(principal) + '?usuario_id=' + otro.id, {}, 422);
    await json('/campus/cursos/9007199254740993/certificado', {}, 404);
    assert.equal(await m.curso_certificados.count(), 0);
  });
  await t.test('2 de 3 completadas no permite emitir; leer no escribe y borrar un video no reduce el total exigido', async () => {
    await completar(principal, principal.lecciones.slice(0, 2));
    const estado = await json(path(principal)); assert.equal(estado.estado, 'PENDIENTE');
    assert.equal(estado.lecciones_requeridas, 3); assert.equal(estado.lecciones_completadas, 2);
    await emitir(principal, {}, 409); await json(path(principal) + '/pdf', {}, 404);
    await video.update({ estado: 'PENDIENTE_ELIMINACION' });
    assert.equal((await json(path(principal))).lecciones_requeridas, 3); await emitir(principal, {}, 409);
    await video.update({ estado: 'DISPONIBLE' });
    assert.equal(await m.curso_certificados.count(), 0);
  });
  await t.test('100% de una selección y lecciones bloqueadas o programadas no certifican el curso completo', async () => {
    const parcial = await contenido(); await completar(parcial);
    await parcial.acceso.update({ alcance: 'SELECCION' });
    await m.curso_acceso_lecciones.create({ acceso_id: parcial.acceso.id, curso_id: parcial.curso.id, leccion_id: parcial.lecciones[0].id });
    assert.equal((await json(path(parcial))).estado, 'ACCESO_PARCIAL'); await emitir(parcial, {}, 409);
    await parcial.acceso.update({ alcance: 'COMPLETO' });
    const excepcion = await m.curso_acceso_lecciones.create({ acceso_id: parcial.acceso.id, curso_id: parcial.curso.id,
      leccion_id: parcial.lecciones[1].id, estado: 'BLOQUEADA' });
    assert.equal((await json(path(parcial))).estado, 'ACCESO_RESTRINGIDO'); await emitir(parcial, {}, 409);
    await excepcion.update({ estado: 'HABILITADA', inicio_en: '2098-01-01T00:00:00.000Z' }); await emitir(parcial, {}, 409);
  });
  await t.test('Deshabilitado, borrador, suspensión, revocación y vencimiento bloquean; vacío no certifica', async () => {
    const bloqueado = await contenido(); await completar(bloqueado);
    await bloqueado.curso.update({ certificado_habilitado: 0 }); await emitir(bloqueado, {}, 409);
    await bloqueado.curso.update({ certificado_habilitado: 1, estado: 'BORRADOR' }); await emitir(bloqueado, {}, 409);
    await bloqueado.curso.update({ estado: 'PUBLICADO' });
    for (const estado of ['SUSPENDIDO', 'REVOCADO']) { await bloqueado.acceso.update({ estado }); await emitir(bloqueado, {}, 409); }
    await bloqueado.acceso.update({ estado: 'ACTIVO', vence_en: '2020-01-02T00:00:00.000Z' }); await emitir(bloqueado, {}, 409);
    await bloqueado.acceso.update({ vence_en: '2099-01-01T00:00:00.000Z', inicio_en: '2098-01-01T00:00:00.000Z' }); await emitir(bloqueado, {}, 409);
    await bloqueado.acceso.update({ inicio_en: '2020-01-01T00:00:00.000Z' });
    await bloqueado.modulo.update({ estado: 'ARCHIVADO' }); assert.equal((await json(path(bloqueado))).estado, 'SIN_CONTENIDO'); await emitir(bloqueado, {}, 409);
  });
  await t.test('Auditoría fallida revierte la primera emisión y no altera permisos ni progreso', async () => {
    await completar(principal, principal.lecciones.slice(2));
    assert.equal((await json(path(principal))).estado, 'LISTO');
    const before = JSON.stringify([await m.curso_accesos.findAll(), await m.leccion_progreso.findAll()]);
    const original = m.auditoria_eventos.create;
    m.auditoria_eventos.create = async () => { throw new Error('detalle privado de auditoría'); };
    try { await emitir(principal, {}, 500); } finally { m.auditoria_eventos.create = original; }
    assert.equal(await m.curso_certificados.count(), 0);
    assert.equal(JSON.stringify([await m.curso_accesos.findAll(), await m.leccion_progreso.findAll()]), before);
  });
  let registro;
  await t.test('Primera emisión congela datos; recarga y POST repetido conservan una sola fila y auditoría', async () => {
    const primera = await emitir(principal); assert.equal(primera.estado, 'EMITIDO'); assert.equal(primera.certificado.carga_horaria, '12.50');
    const repetida = await emitir(principal, {}, 200); assert.deepEqual(repetida, primera);
    assert.equal(await m.curso_certificados.count(), 1);
    assert.equal(await m.auditoria_eventos.count({ where: { accion: 'CERTIFICADO_EMITIDO' } }), 1);
    registro = (await m.curso_certificados.findOne()).get({ plain: true });
    assert.equal(registro.lecciones_requeridas, 3); assert.equal(registro.lecciones_completadas, 3);
    assert.ok(!JSON.stringify(primera).includes('usuario_id')); assert.ok(!JSON.stringify(primera).includes('password'));
  });
  await t.test('Descarga privada y HEAD; cambiar nombre, horas, título y acceso no reescribe el diploma', async () => {
    const res = await send(path(principal) + '/pdf'); assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/pdf/); assert.equal(res.headers.get('cache-control'), 'private, no-store');
    const bytes = Buffer.from(await res.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length < 1024 * 1024);
    const head = await send(path(principal) + '/pdf', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
    await alumno.update({ nombre: 'Nombre cambiado' });
    await principal.curso.update({ titulo: 'Curso cambiado', certificado_carga_horaria: '99.00', certificado_habilitado: 0, estado: 'ARCHIVADO' });
    await principal.acceso.update({ estado: 'REVOCADO' });
    assert.deepEqual((await m.curso_certificados.findOne()).get({ plain: true }), registro);
    assert.equal((await json(path(principal))).certificado.alumno_nombre, 'Benjamin');
    const after = await send(path(principal) + '/pdf'); assert.equal(after.status, 200);
    assert.deepEqual(Buffer.from(await after.arrayBuffer()), bytes);
    await emitir(principal, {}, 200);
    await json(path(principal), { cookie: otroJar }, 404); await json(path(principal) + '/pdf', { cookie: otroJar }, 404);
    await json(path(ajeno), {}, 404); await emitir(ajeno, {}, 404);
  });
  await t.test('Sesión revocada entre autenticación y transacción y cuenta bloqueada impiden emitir/descargar', async () => {
    const nuevo = await contenido(); await completar(nuevo);
    const original = m.curso_certificados.findOne;
    m.curso_certificados.findOne = async (...args) => {
      const result = await original.apply(m.curso_certificados, args);
      await m.usuarios_sesiones.update({ revocada_en: '2026-01-01T00:00:00Z' }, { where: { usuario_id: alumno.id }, transaction: args[0]?.transaction });
      return result;
    };
    try { await emitir(nuevo, {}, 401); } finally { m.curso_certificados.findOne = original; }
    assert.equal(await m.curso_certificados.count(), 1);
    await alumno.update({ estado: 'BLOQUEADO' }); await json(path(principal) + '/pdf', {}, 401);
  });
});

test('PDF: Unicode, nombres/títulos extensos, una página y fecha de emisión argentina estable', async () => {
  const row = { plantilla_version: 1, alumno_nombre: 'María José Ñúñez de los Ángeles <Alumno>',
    curso_titulo: 'Dirección estratégica y organización del negocio', carga_horaria: '12.50', emitido_en: '2026-11-01T01:30:00.123Z' };
  const pdf = await generarDiploma(row); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(await generarDiploma(row), pdf);
  assert.match(pdf.toString('latin1'), /\/Count 1\b/);
  const largo = await generarDiploma({ ...row, alumno_nombre: 'María José de los Ángeles Ñúñez '.repeat(5).slice(0, 180),
    curso_titulo: 'Dirección estratégica del negocio y rentabilidad '.repeat(4).slice(0, 180) });
  assert.match(largo.toString('latin1'), /\/Count 1\b/);
  await assert.rejects(() => generarDiploma({ ...row, plantilla_version: 2 }));
});
