/* Benjamin Orellana - 24/10/2026 - Configuración de diploma y registro aislado; sin emitir PDFs ni diplomas reales. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
Object.assign(process.env, { NODE_ENV: 'test', DB_PASSWORD: 'Fixture Certificados', FRONTEND_URL: 'http://127.0.0.1:5173',
  ALLOWED_ORIGINS: 'http://127.0.0.1:5173', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', TRUST_PROXY: 'false',
  MP_HABILITADO: 'false', CORREO_HABILITADO: 'false' });
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { hashPassword } = await import('../src/utils/password.utils.js');
const { cargaHorariaCertificado, validarConfiguracionCertificado } = await import('../src/Services/Certificado/configuracionCertificado.service.js');

test('Horas del diploma: decimal exacto, nullable solo cuando está deshabilitado y sin estimación por videos', () => {
  assert.equal(cargaHorariaCertificado('12.5'), '12.50'); assert.equal(cargaHorariaCertificado('0.01'), '0.01');
  assert.equal(cargaHorariaCertificado('9999.99'), '9999.99'); assert.equal(cargaHorariaCertificado(null), null);
  for (const valor of [12, '0', '-1', '10000', '1.001', '12,50', '1e3', '01', '', 'NaN']) assert.throws(() => cargaHorariaCertificado(valor));
  assert.throws(() => validarConfiguracionCertificado({ certificado_habilitado: 1 }));
  assert.throws(() => validarConfiguracionCertificado({ certificado_carga_horaria: null }, { certificado_habilitado: 1, certificado_carga_horaria: '10.00' }));
  validarConfiguracionCertificado({ certificado_habilitado: 0, certificado_carga_horaria: null }, { certificado_habilitado: 1, certificado_carga_horaria: '10.00' });
});

test('Certificados etapa 1: administración de cursos y registro sin emisión pública', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const password = 'Certificados Fixture 2026';
  const password_hash = await hashPassword(password);
  const admin = await m.usuarios.create({ nombre: 'Juan', email: 'juan@diploma.invalid', rol: 'ADMIN', estado: 'ACTIVO', cambiar_password: 0, password_hash });
  const cliente = await m.crm_clientes.create({ nombre: 'Benjamin Alumno' });
  const alumno = await m.usuarios.create({ nombre: 'Benjamin Alumno', email: 'benjamin@diploma.invalid', rol: 'ALUMNO',
    cliente_id: cliente.id, estado: 'ACTIVO', cambiar_password: 0, password_hash });
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await adapter.close(); });
  let jar, student, curso;
  async function request(path, { method = 'GET', body, cookie = jar, headers = {} } = {}, status = 200) {
    const res = await fetch(base + '/api' + path, { method,
      headers: { origin: process.env.FRONTEND_URL, ...(cookie ? { cookie: cookie.cookie, 'x-csrf-token': cookie.csrf } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await res.json(); assert.equal(res.status, status, JSON.stringify(json));
    return { res, data: json.data, json };
  }
  async function login(user) {
    const { res, data } = await request('/auth/login', { method: 'POST', cookie: null, body: { email: user.email, password } });
    return { cookie: res.headers.get('set-cookie').split(';')[0], csrf: data.csrf_token };
  }
  const patch = (body, status = 200, cookie = jar) => request('/admin/cursos/' + curso.id, { method: 'PATCH', body, cookie }, status);
  await t.test('Solo ADMIN configura; sesión, origen y CSRF siguen siendo obligatorios', async () => {
    jar = await login(admin); student = await login(alumno);
    curso = (await request('/admin/cursos', { method: 'POST', body: { titulo: 'Motor de Resultados' } }, 201)).data;
    assert.equal(curso.certificado_habilitado, 0); assert.equal(curso.certificado_carga_horaria, null);
    await patch({ certificado_habilitado: 1, certificado_carga_horaria: '12.50' }, 401, null);
    await patch({ certificado_habilitado: 1, certificado_carga_horaria: '12.50' }, 403, student);
    await request('/admin/cursos/' + curso.id, { method: 'PATCH', body: { certificado_carga_horaria: '12.50' }, headers: { 'x-csrf-token': 'falso' } }, 403);
    assert.equal(await m.curso_certificados.count(), 0);
  });
  await t.test('Carga horaria obligatoria al habilitar; validar antes de escribir y permitir preparación en borrador', async () => {
    await patch({ certificado_habilitado: 1 }, 422);
    for (const horas of ['0', '-5', '10000', '1.001', 12]) await patch({ certificado_carga_horaria: horas }, 422);
    await patch({ certificado_habilitado: 2 }, 422);
    await patch({ certificado_habilitado: 1, certificado_carga_horaria: '12.5' });
    const { data } = await request('/admin/cursos/' + curso.id);
    assert.equal(data.certificado_carga_horaria, '12.50'); assert.equal(data.certificado_habilitado, 1);
    assert.equal(data.estado, 'BORRADOR'); assert.equal(await m.curso_certificados.count(), 0);
  });
  await t.test('Edición parcial conserva horas y accesos; limpiar exige deshabilitar y nunca resetea progreso', async () => {
    const acceso = await m.curso_accesos.create({ usuario_id: alumno.id, curso_id: curso.id, alcance: 'COMPLETO', estado: 'ACTIVO',
      inicio_en: '2026-10-01T12:00:00Z', vence_en: '2030-01-01T12:00:00Z', asignado_por: admin.id });
    const modulo = await m.curso_modulos.create({ curso_id: curso.id, titulo: 'Módulo' });
    const leccion = await m.curso_lecciones.create({ curso_id: curso.id, modulo_id: modulo.id, titulo: 'Lección' });
    const progreso = await m.leccion_progreso.create({ usuario_id: alumno.id, curso_id: curso.id, leccion_id: leccion.id,
      estado: 'COMPLETADA', completada_en: '2026-10-24T12:00:00Z' });
    const snapshot = JSON.stringify([(await acceso.reload()).toJSON(), (await progreso.reload()).toJSON()]);
    await patch({ descripcion_corta: 'Descripción nueva' });
    assert.equal((await m.cursos.findByPk(curso.id)).certificado_carga_horaria, '12.50');
    await patch({ certificado_carga_horaria: null }, 422);
    await patch({ certificado_habilitado: 0, certificado_carga_horaria: null });
    assert.equal(JSON.stringify([(await acceso.reload()).toJSON(), (await progreso.reload()).toJSON()]), snapshot);
    assert.equal(await m.curso_certificados.count(), 0);
  });
  await t.test('Error de auditoría revierte configuración completa y no crea un diploma', async () => {
    const original = m.auditoria_eventos.create;
    m.auditoria_eventos.create = async () => { throw new Error('Detalle interno controlado'); };
    try { await patch({ certificado_habilitado: 1, certificado_carga_horaria: '20.00' }, 500); }
    finally { m.auditoria_eventos.create = original; }
    const row = await m.cursos.findByPk(curso.id);
    assert.equal(row.certificado_habilitado, 0); assert.equal(row.certificado_carga_horaria, null);
  });
  await t.test('Registro único por alumno y curso; conserva nombres, horas y fecha frente a ediciones posteriores', async () => {
    const registro = await m.curso_certificados.create({ usuario_id: alumno.id, curso_id: curso.id, alumno_nombre: alumno.nombre,
      curso_titulo: curso.titulo, carga_horaria: '12.50', lecciones_requeridas: 1, lecciones_completadas: 1 });
    const snapshot = JSON.stringify((await registro.reload()).toJSON());
    await assert.rejects(() => m.curso_certificados.create({ ...registro.get({ plain: true }), id: undefined }));
    await patch({ titulo: 'Título actualizado', certificado_carga_horaria: '20.00', certificado_habilitado: 1 });
    await alumno.update({ nombre: 'Nombre corregido después' });
    assert.equal(JSON.stringify((await registro.reload()).toJSON()), snapshot);
    for (const data of [{ carga_horaria: '0' }, { carga_horaria: '10000' }, { lecciones_completadas: 0 },
      { lecciones_requeridas: 0, lecciones_completadas: 0 }, { plantilla_version: 0 }, { alumno_nombre: '  ' }, { curso_titulo: '' }]) {
      await assert.rejects(() => registro.update(data)); await registro.reload();
    }
  });
  await t.test('La configuración no permite editar diplomas; emisión valida el curso completo' , async () => {
    await patch({ alumno_nombre: 'Otro alumno', emitido_en: '2000-01-01' }, 422);
    await request('/campus/cursos/' + curso.id + '/certificado', { cookie: student, method: 'POST', body: {} }, 200);
    await request('/campus/certificados/1', { cookie: student, method: 'PATCH', body: { carga_horaria: '1.00' } }, 404);
    assert.equal(await m.curso_certificados.count(), 1);
  });
  await t.test('Restricciones de cursos y migración repetible; no usa CHECK en columna AUTO_INCREMENT', async () => {
    await assert.rejects(() => m.cursos.update({ certificado_carga_horaria: null }, { where: { id: curso.id } }));
    const mysql = await readFile(new URL('../docs/sql/CERTIFICADOS_ETAPA1.sql', import.meta.url), 'utf8');
    const fixture = await readFile(new URL('./fixtures/certificados.sqlite.sql', import.meta.url), 'utf8');
    const cursoFixture = await readFile(new URL('./fixtures/certificados-cursos.sqlite.sql', import.meta.url), 'utf8');
    const checks = sql => [...sql.matchAll(/CONSTRAINT (ck_\w+)/g)].map(m => m[1]).sort();
    assert.deepEqual(checks(mysql), checks(cursoFixture + fixture));
    assert.match(mysql, /CREATE TABLE IF NOT EXISTS curso_certificados/);
    assert.doesNotMatch(mysql, /CHECK\s*\(\s*id\s*[=<>]/);
    assert.doesNotMatch(mysql, /\b(?:INSERT INTO|UPDATE cursos|DELETE FROM)\b/i);
  });
});
