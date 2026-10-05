import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { literal } from 'sequelize';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import * as Accesos from '../src/Controllers/Acceso/CTS_TB_CursoAccesos.js';
import * as Lecciones from '../src/Controllers/Acceso/CTS_TB_CursoAccesoLecciones.js';
import * as Historial from '../src/Controllers/Acceso/CTS_TB_CursoAccesosHistorial.js';
import * as Auth from '../src/Controllers/Usuario/CTS_Auth.js';
import * as Security from '../src/Security/auth.js';
import { hashPassword, hashToken, tokenAleatorio } from '../src/utils/password.utils.js';
import { fechaUTC, estadoTemporal, ventanaEfectiva, permisoLeccion } from '../src/Services/Acceso/permisoAcceso.service.js';
import { conectarPrueba } from './adapter-crm.js';

test('Accesos: HTTP autenticado, asignaciones, ventanas UTC e historial con SQLite aislado', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'contenido.sqlite.sql' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'factore-accesos-'));
  const previousStorage = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = root;
  await mkdir(path.join(root, 'videos'), { mode: 0o700 });
  const password = 'Clave de pruebas Factor E 2026';
  const hash = await hashPassword(password);
  const admin = await modelos.usuarios.create({ nombre: 'Juan Admin', email: 'juan@example.invalid', rol: 'ADMIN', estado: 'ACTIVO', password_hash: hash });
  const cliente = await modelos.crm_clientes.create({ nombre: 'Cliente campus', observaciones_internas: 'NOTA PRIVADA CRM' });
  const student = await modelos.usuarios.create({ nombre: 'Alumno uno', email: 'alumno@example.invalid', rol: 'ALUMNO', estado: 'ACTIVO', cliente_id: cliente.id, password_hash: hash });
  const pendingClient = await modelos.crm_clientes.create({ nombre: 'Cliente pendiente' });
  const pending = await modelos.usuarios.create({ nombre: 'Pendiente', email: 'pendiente@example.invalid', rol: 'ALUMNO', cliente_id: pendingClient.id });
  let server, base, adminJar, alumnoJar, completo, seleccionado, curso, otroCurso, modulo, video, l1, l2, l3, otraLeccion;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (previousStorage === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = previousStorage;
    await adapter.close(); await rm(root, { recursive: true, force: true });
  });
  async function archivo({ existe = true, tipo = 'VIDEO', estado = 'DISPONIBLE' } = {}) {
    const uuid = randomUUID(), relative = `videos/${uuid}.mp4`;
    if (existe) await writeFile(path.join(root, relative), 'video', { mode: 0o600 });
    return modelos.archivos.create({ uuid, tipo, estado, ruta_relativa: relative, nombre_guardado: `${uuid}.mp4`,
      nombre_original: 'clase.mp4', extension: 'mp4', mime_type: 'video/mp4', tamanio_bytes: '5', sha256: 'HASH PRIVADO VIDEO', subido_por: admin.id });
  }
  async function crearContenido(titulo) {
    const c = await modelos.cursos.create({ titulo, slug: titulo.toLowerCase().replaceAll(' ', '-'), estado: 'PUBLICADO', creado_por: admin.id });
    const m = await modelos.curso_modulos.create({ curso_id: c.id, titulo: 'Módulo uno', estado: 'ACTIVO' });
    const l = await modelos.curso_lecciones.create({ curso_id: c.id, modulo_id: m.id, titulo: 'Video uno', estado: 'PUBLICADA', video_archivo_id: video.id });
    return { c, m, l };
  }
  function resAdapter(res) { res.status = code => { res.statusCode = code; return res; }; res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; }; }
  server = createServer(async (req, res) => {
    resAdapter(res); req.ip = req.socket.remoteAddress;
    const url = new URL(req.url, 'http://test'); req.query = Object.fromEntries(url.searchParams); req.params = {};
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { const chunks = []; for await (const chunk of req) chunks.push(chunk); req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
      if (url.pathname === '/api/auth/login') return Auth.LOGIN_CTS(req, res);
      for (const middleware of [Security.autenticar, Security.exigirPasswordActualizada, Security.soloAdmin]) {
        let passed = false; await middleware(req, res, () => { passed = true; }); if (!passed) return;
      }
      const match = /^\/api\/admin\/accesos(?:\/([^/]+))?(?:\/(renovar|suspender|reactivar|historial|lecciones))?(?:\/([^/]+))?$/.exec(url.pathname);
      if (!match) return res.status(404).end();
      req.params = { id: match[1], acceso_id: match[1], leccion_id: match[3] };
      const acciones = { renovar: Accesos.RENOVAR_CursoAcceso_CTS, suspender: Accesos.SUSPENDER_CursoAcceso_CTS,
        reactivar: Accesos.REACTIVAR_CursoAcceso_CTS, historial: Historial.OBRS_CursoAccesosHistorial_CTS };
      let handler = acciones[match[2]];
      if (match[2] === 'lecciones') handler = req.method === 'GET' ? Lecciones.OBRS_CursoAccesoLecciones_CTS
        : req.method === 'DELETE' ? Lecciones.ER_CursoAccesoLeccion_CTS : Lecciones.UR_CursoAccesoLeccion_CTS;
      if (!handler) handler = req.method === 'POST' ? Accesos.CR_CursoAcceso_CTS : req.method === 'PATCH' ? Accesos.UR_CursoAcceso_CTS
        : req.method === 'DELETE' ? Accesos.ER_CursoAcceso_CTS : match[1] ? Accesos.OBRS_DetCursoAcceso_CTS : Accesos.OBRS_CursoAccesos_CTS;
      return handler(req, res);
    } catch (error) { res.status(500).json({ error: error.name }); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  async function call(route = '', { method, body, jar = adminJar, headers = {} } = {}, expected = 200) {
    const response = await fetch(base + '/api/admin/accesos' + route, { method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(jar ? { cookie: jar.cookie, 'x-csrf-token': jar.csrf } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value;
  }
  async function login(user) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value));
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: value.data.csrf_token };
  }
  const baseBody = () => ({ usuario_id: student.id, curso_id: curso.id });
  const permiso = async (accesoId, lessonId) => (await call(`/${accesoId}/lecciones`)).data.find(row => row.id === String(lessonId));

  await t.test('Administración con cookie y CSRF; alumno, cuenta bloqueada y IDs libres no autorizan', async () => {
    await call('', { jar: null, headers: { 'x-user-id': admin.id } }, 401);
    adminJar = await login(admin); alumnoJar = await login(student);
    await call('', { jar: alumnoJar }, 403);
    await call('', { body: { usuario_id: student.id }, headers: { 'x-csrf-token': 'falso' } }, 403);
    await call('', { body: {}, headers: { origin: 'https://otro.example.invalid' } }, 403);
    await admin.update({ cambiar_password: 1 }); await call('', {}, 403); await admin.update({ cambiar_password: 0 });
    await admin.update({ estado: 'BLOQUEADO' }); await call('', {}, 401); await admin.update({ estado: 'ACTIVO' });
    video = await archivo(); const first = await crearContenido('Curso Factor E'); curso = first.c; modulo = first.m; l1 = first.l;
    l2 = await modelos.curso_lecciones.create({ curso_id: curso.id, modulo_id: modulo.id, titulo: 'Video dos', estado: 'PUBLICADA', video_archivo_id: video.id });
    const other = await crearContenido('Otro curso'); otroCurso = other.c; otraLeccion = other.l;
  });
  await t.test('Asignación completa y pendiente: actor de sesión, una fila por alumno/curso y ficha independiente', async () => {
    completo = (await call('', { body: { ...baseBody(), observaciones_internas: 'NOTA PRIVADA ACCESO', motivo: 'Asignación manual' } }, 201)).data;
    assert.equal(completo.alcance, 'COMPLETO'); assert.equal(completo.estado_temporal, 'ACTIVO'); assert.equal(completo.asignado_por, String(admin.id)); assert.equal(completo.vence_en, null);
    await call('', { body: baseBody() }, 409);
    const before = await modelos.curso_accesos.count();
    for (const body of [{ ...baseBody(), usuario_id: admin.id }, { ...baseBody(), cliente_id: cliente.id }, { ...baseBody(), asignado_por: student.id }, { ...baseBody(), estado: 'ACTIVO' }, { ...baseBody(), usuario_id: 9007199254740992 }]) await call('', { body }, 422);
    assert.equal(await modelos.curso_accesos.count(), before);
    const p = (await call('', { body: { usuario_id: pending.id, curso_id: curso.id } }, 201)).data;
    assert.equal((await permiso(p.id, l1.id)).motivo, 'CUENTA_NO_ACTIVA');
    const noAccount = await modelos.crm_clientes.create({ nombre: 'Solo CRM' }); assert.equal(await modelos.usuarios.count({ where: { cliente_id: noAccount.id } }), 0);
  });
  await t.test('Selección inicial atómica: lecciones propias, publicadas y con video físico disponible', async () => {
    const core = { usuario_id: student.id, curso_id: otroCurso.id, alcance: 'SELECCION' };
    const draft = await modelos.curso_lecciones.create({ curso_id: otroCurso.id, modulo_id: otraLeccion.modulo_id, titulo: 'Borrador' });
    const missing = await archivo({ existe: false });
    const bad = await modelos.curso_lecciones.create({ curso_id: otroCurso.id, modulo_id: otraLeccion.modulo_id, titulo: 'Sin disco', estado: 'PUBLICADA', video_archivo_id: missing.id });
    for (const lecciones of [[], [{ leccion_id: l1.id }], [{ leccion_id: draft.id }], [{ leccion_id: bad.id }], [{ leccion_id: otraLeccion.id }, { leccion_id: otraLeccion.id }]]) {
      await call('', { body: { ...core, lecciones } }, 422);
      assert.equal(await modelos.curso_accesos.count({ where: { usuario_id: student.id, curso_id: otroCurso.id } }), 0);
    }
    seleccionado = (await call('', { body: { ...core, lecciones: [{ leccion_id: otraLeccion.id }] } }, 201)).data;
    assert.equal(seleccionado.lecciones.length, 1);
    assert.equal((await permiso(seleccionado.id, otraLeccion.id)).habilitada, true);
    await call(`/${seleccionado.id}/lecciones/${l1.id}`, { method: 'PATCH', body: { estado: 'BLOQUEADA' } }, 422);
  });
  await t.test('Fechas UTC estrictas, calendario real y límites de milisegundos', async () => {
    for (const input of ['2026-10-05T10:00:00', '2026-10-05T10:00:00-03:00', '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-05T24:00:00Z', '0999-01-01T00:00:00Z', '2026-10-05T00:00:00.1234Z'])
      await call(`/${completo.id}`, { method: 'PATCH', body: { inicio_en: input } }, 422);
    assert.equal(fechaUTC('2030-01-01T00:00:00.1Z', 'fecha').toISOString(), '2030-01-01T00:00:00.100Z');
    await call(`/${completo.id}`, { method: 'PATCH', body: { inicio_en: '2099-01-01T00:00:00Z', vence_en: '2099-01-01T00:00:00Z' } }, 422);
    const start = '2030-01-01T00:00:00.000Z', end = '2030-01-01T00:00:00.001Z';
    assert.equal(estadoTemporal({ estado: 'ACTIVO', inicio_en: start, vence_en: end }, new Date(start)), 'ACTIVO');
    assert.equal(estadoTemporal({ estado: 'ACTIVO', inicio_en: start, vence_en: end }, new Date(end)), 'VENCIDO');
    assert.equal(estadoTemporal({ estado: 'REVOCADO', inicio_en: start, vence_en: end }, new Date(end)), 'REVOCADO');
  });
  await t.test('111 asignaciones completas, búsqueda, filtros y paginación sin límite implícito', async () => {
    for (let n = 0; n < 108; n++) {
      const c = await modelos.crm_clientes.create({ nombre: `Demo ${n}` });
      const u = await modelos.usuarios.create({ nombre: `Alumno demo ${n}`, email: `demo${n}@example.invalid`, rol: 'ALUMNO', cliente_id: c.id });
      await modelos.curso_accesos.create({ usuario_id: u.id, curso_id: curso.id, asignado_por: admin.id });
    }
    const all = await call(); assert.equal(all.data.length, 111); assert.equal(all.meta.paginado, false);
    const paged = await call('?pagina=2&por_pagina=10&q=demo'); assert.equal(paged.data.length, 10); assert.equal(paged.meta.total, 108);
    assert.equal((await call('?usuario_id=' + student.id)).data.length, 2);
    assert.equal((await call('?curso_id=' + otroCurso.id + '&alcance=SELECCION')).data.length, 1);
    assert.equal((await call('?q=' + encodeURIComponent("x' OR 1=1 --"))).data.length, 0);
    assert.equal((await call('?q=Curso%20Factor')).data.length, 110);
    for (const q of ['limit=100', 'por_pagina=501', 'estado_temporal=OTRO', 'ordenar_por=password_hash', 'vence_desde=2026-01-01']) await call('?' + q, {}, 422);
    const output = JSON.stringify(all); for (const secret of ['password_hash', 'HASH PRIVADO VIDEO', 'NOTA PRIVADA CRM', 'ruta_relativa']) assert.ok(!output.includes(secret));
  });
  await t.test('Programación y vencimiento se calculan desde MySQL; rango de vencimientos exclusivo', async () => {
    await call(`/${completo.id}`, { method: 'PATCH', body: { inicio_en: '2099-01-01T00:00:00Z', vence_en: '2100-01-01T00:00:00Z' } });
    assert.equal((await call(`/${completo.id}`)).data.estado_temporal, 'PROGRAMADO');
    assert.equal((await permiso(completo.id, l1.id)).motivo, 'ACCESO_PROGRAMADO');
    assert.equal((await call('?estado_temporal=PROGRAMADO')).data.length, 1);
    assert.equal((await call('?vence_desde=2099-01-01T00:00:00Z&vence_hasta=2100-01-01T00:00:00Z')).data.length, 0);
    await modelos.curso_accesos.update({ inicio_en: '2000-01-01T00:00:00.000Z', vence_en: literal('UTC_TIMESTAMP(3)') }, { where: { id: completo.id } });
    assert.equal((await call(`/${completo.id}`)).data.estado_temporal, 'VENCIDO');
    assert.equal((await call('?estado_temporal=VENCIDO')).data.length, 1);
    await call(`/${completo.id}/reactivar`, { body: {} }, 409);
    await call(`/${completo.id}/renovar`, { body: { vence_en: null } });
    assert.equal((await permiso(completo.id, l1.id)).habilitada, true);
  });
  await t.test('Completo incluye nuevos videos; bloquear deniega y quitar excepción vuelve a heredar', async () => {
    l3 = await modelos.curso_lecciones.create({ curso_id: curso.id, modulo_id: modulo.id, titulo: 'Nuevo video', estado: 'PUBLICADA', video_archivo_id: video.id });
    assert.equal((await permiso(completo.id, l3.id)).habilitada, true);
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'PATCH', body: { estado: 'BLOQUEADA' } });
    assert.equal((await permiso(completo.id, l1.id)).motivo, 'LECCION_BLOQUEADA');
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'DELETE', body: {} }, 422);
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'DELETE', body: { confirmar: true } });
    assert.equal((await permiso(completo.id, l1.id)).habilitada, true);
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'PATCH', body: { inicio_en: '2000-01-01T00:00:00Z', vence_en: '2001-01-01T00:00:00Z' } });
    assert.equal((await permiso(completo.id, l1.id)).motivo, 'LECCION_VENCIDA');
    assert.equal((await permiso(completo.id, l2.id)).habilitada, true);
  });
  await t.test('Ventanas de video intersectadas y edición parcial que conserva fechas', async () => {
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'DELETE', body: { confirmar: true } });
    await call(`/${completo.id}`, { method: 'PATCH', body: { inicio_en: '2099-01-01T00:00:00Z', vence_en: '2100-01-01T00:00:00Z' } });
    for (const body of [{ vence_en: '2099-01-01T00:00:00Z' }, { inicio_en: '2100-01-01T00:00:00Z' }, { inicio_en: '2099-06-01T00:00:00Z', vence_en: '2099-05-01T00:00:00Z' }])
      await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'PATCH', body }, 422);
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'PATCH', body: { inicio_en: '2098-01-01T11:23:45.123Z', vence_en: '2099-06-01T22:01:02.456Z' } });
    const p = await permiso(completo.id, l1.id); assert.equal(p.inicio_efectivo_en, '2099-01-01T00:00:00.000Z'); assert.equal(p.vence_efectivo_en, '2099-06-01T22:01:02.456Z');
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'PATCH', body: { estado: 'BLOQUEADA' } });
    const detail = (await call(`/${completo.id}`)).data; assert.equal(detail.lecciones[0].inicio_en, '2098-01-01T11:23:45.123Z'); assert.equal(detail.lecciones[0].vence_en, '2099-06-01T22:01:02.456Z');
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'PATCH', body: { estado: 'HABILITADA', inicio_en: null, vence_en: null } });
    await call(`/${completo.id}/renovar`, { body: { inicio_en: '2000-01-01T00:00:00Z', vence_en: null } });
  });
  await t.test('Último video seleccionado: retiro suspende, agregar no reactiva por sí solo', async () => {
    const another = await modelos.curso_lecciones.create({ curso_id: otroCurso.id, modulo_id: otraLeccion.modulo_id, titulo: 'No seleccionado', estado: 'PUBLICADA', video_archivo_id: video.id });
    assert.equal((await permiso(seleccionado.id, another.id)).motivo, 'LECCION_NO_SELECCIONADA');
    const removed = await call(`/${seleccionado.id}/lecciones/${otraLeccion.id}`, { method: 'DELETE', body: { confirmar: true } });
    assert.equal(removed.data.estado, 'SUSPENDIDO');
    await call(`/${seleccionado.id}/reactivar`, { body: {} }, 422);
    await call(`/${seleccionado.id}/lecciones/${another.id}`, { method: 'PATCH', body: { estado: 'HABILITADA' } });
    assert.equal((await call(`/${seleccionado.id}`)).data.estado, 'SUSPENDIDO');
    await call(`/${seleccionado.id}/reactivar`, { body: {} });
    const blocked = await call(`/${seleccionado.id}/lecciones/${another.id}`, { method: 'PATCH', body: { estado: 'BLOQUEADA' } });
    assert.equal(blocked.data.estado, 'SUSPENDIDO');
    await call(`/${seleccionado.id}/lecciones/${otraLeccion.id}`, { method: 'PATCH', body: { estado: 'HABILITADA' } });
    await call(`/${seleccionado.id}/reactivar`, { body: {} });
  });
  await t.test('Cambio de alcance y reemplazo explícito conservan bloqueos y nunca amplían una selección vacía', async () => {
    await call(`/${completo.id}`, { method: 'PATCH', body: { alcance: 'SELECCION', lecciones: [] } }, 422);
    await call(`/${completo.id}`, { method: 'PATCH', body: { alcance: 'SELECCION', lecciones: [{ leccion_id: l1.id }, { leccion_id: l2.id, estado: 'BLOQUEADA' }] } });
    assert.equal((await permiso(completo.id, l3.id)).motivo, 'LECCION_NO_SELECCIONADA');
    await call(`/${completo.id}`, { method: 'PATCH', body: { alcance: 'COMPLETO' } });
    assert.equal((await permiso(completo.id, l2.id)).motivo, 'LECCION_BLOQUEADA'); assert.equal((await permiso(completo.id, l3.id)).habilitada, true);
    await call(`/${completo.id}`, { method: 'PATCH', body: { alcance: 'SELECCION' } });
    const empty = await call(`/${completo.id}`, { method: 'PATCH', body: { lecciones: [] } }); assert.equal(empty.data.estado, 'SUSPENDIDO');
    await call(`/${completo.id}`, { method: 'PATCH', body: { alcance: 'COMPLETO', lecciones: [] } });
    assert.equal((await call(`/${completo.id}`)).data.estado, 'SUSPENDIDO');
    await call(`/${completo.id}/reactivar`, { body: {} });
  });
  await t.test('Revocar y suspender cortan permisos; renovación usa la misma fila y conserva progreso', async () => {
    const progress = await modelos.leccion_progreso.create({ usuario_id: student.id, curso_id: curso.id, leccion_id: l1.id,
      estado: 'COMPLETADA', completada_en: literal('UTC_TIMESTAMP(3)'), posicion_segundos: 75 });
    const count = await modelos.curso_accesos.count();
    await call(`/${completo.id}/suspender`, { body: { motivo: 'Pausa manual' } }); assert.equal((await permiso(completo.id, l1.id)).motivo, 'ACCESO_SUSPENDIDO');
    await call(`/${completo.id}/reactivar`, { body: {} });
    await call(`/${completo.id}`, { method: 'DELETE', body: { motivo: 'Revocación manual' } }); assert.equal((await permiso(completo.id, l1.id)).motivo, 'ACCESO_REVOCADO');
    await call(`/${completo.id}/suspender`, { body: {} }, 409);
    await call('', { body: baseBody() }, 409);
    await call(`/${completo.id}/renovar`, { body: {} }, 422);
    await call(`/${completo.id}/renovar`, { body: { vence_en: '2001-01-01T00:00:00Z' } }, 409);
    const renewed = (await call(`/${completo.id}/renovar`, { body: { vence_en: '2100-01-01T00:00:00Z' } })).data;
    assert.equal(renewed.id, completo.id); assert.equal(renewed.asignado_por, String(admin.id)); assert.equal(await modelos.curso_accesos.count(), count);
    const kept = await progress.reload(); assert.equal(kept.estado, 'COMPLETADA'); assert.equal(kept.posicion_segundos, 75); assert.ok(kept.completada_en);
  });
  await t.test('Renovación conserva fechas particulares; restablecerlas es explícito y mantiene bloqueos', async () => {
    await call(`/${completo.id}/lecciones/${l1.id}`, { method: 'PATCH', body: { inicio_en: '2099-01-01T00:00:00Z', vence_en: '2099-06-01T00:00:00Z' } });
    await call(`/${completo.id}/lecciones/${l2.id}`, { method: 'PATCH', body: { estado: 'BLOQUEADA', inicio_en: '2000-01-01T00:00:00Z', vence_en: '2001-01-01T00:00:00Z' } });
    await call(`/${completo.id}/renovar`, { body: { inicio_en: '2099-07-01T00:00:00Z', vence_en: '2101-01-01T00:00:00Z' } }, 422);
    const reset = (await call(`/${completo.id}/renovar`, { body: { inicio_en: '2099-07-01T00:00:00Z', vence_en: '2101-01-01T00:00:00Z', restablecer_fechas_lecciones: true } })).data;
    assert.ok(reset.lecciones.every(row => row.inicio_en === null && row.vence_en === null));
    assert.equal(reset.lecciones.find(row => row.leccion_id === String(l2.id)).estado, 'BLOQUEADA');
    await call(`/${completo.id}/renovar`, { body: { inicio_en: '2000-01-01T00:00:00Z', vence_en: null } });
  });
  await t.test('Contenido archivado y cuentas inactivas no ven; revocar y editar notas siguen disponibles', async () => {
    await curso.update({ estado: 'ARCHIVADO' }); assert.equal((await permiso(completo.id, l1.id)).motivo, 'CURSO_NO_PUBLICADO');
    await call(`/${completo.id}/renovar`, { body: { vence_en: null } }, 422);
    await call(`/${completo.id}`, { method: 'PATCH', body: { observaciones_internas: null } });
    await call(`/${completo.id}`, { method: 'DELETE', body: {} }); await curso.update({ estado: 'PUBLICADO' });
    await cliente.update({ activo: 0 }); await call(`/${completo.id}/reactivar`, { body: {} }, 422); await cliente.update({ activo: 1 });
    await student.update({ estado: 'BLOQUEADO' }); await call(`/${completo.id}/renovar`, { body: { vence_en: null } }, 422); await student.update({ estado: 'ACTIVO' });
    await call(`/${completo.id}/reactivar`, { body: {} });
    await modulo.update({ estado: 'ARCHIVADO' }); assert.equal((await permiso(completo.id, l1.id)).motivo, 'CONTENIDO_NO_PUBLICADO'); await modulo.update({ estado: 'ACTIVO' });
    await l1.update({ estado: 'ARCHIVADA' }); assert.equal((await permiso(completo.id, l1.id)).motivo, 'CONTENIDO_NO_PUBLICADO'); await l1.update({ estado: 'PUBLICADA' });
  });
  await t.test('Videos fuera de ventana y referencias cruzadas nunca habilitan', async () => {
    const c = { usuario: student, cliente, curso, modulo, leccion: l1, video }, a = await modelos.curso_accesos.findByPk(completo.id);
    const now = new Date('2030-01-01T00:00:00.000Z');
    const row = { acceso_id: a.id, curso_id: curso.id, leccion_id: l1.id, estado: 'HABILITADA', inicio_en: null, vence_en: '2030-01-01T00:00:00.000Z' };
    assert.equal(permisoLeccion(a, row, c, now).motivo, 'LECCION_VENCIDA');
    assert.equal(permisoLeccion(a, { ...row, vence_en: null, inicio_en: '2030-01-01T00:00:00.001Z' }, c, now).motivo, 'LECCION_PROGRAMADA');
    assert.equal(permisoLeccion(a, { ...row, acceso_id: '999' }, c, now).motivo, 'RELACION_INVALIDA');
    assert.equal(permisoLeccion(a, null, { ...c, curso: otroCurso }, now).motivo, 'RELACION_INVALIDA');
    assert.equal(ventanaEfectiva({ inicio_en: '2030-01-01T00:00:00Z', vence_en: null }, { inicio_en: null, vence_en: null }).vence_en, null);
    await video.update({ estado: 'SUBIENDO' }); assert.equal((await permiso(completo.id, l1.id)).motivo, 'VIDEO_NO_DISPONIBLE'); await video.update({ estado: 'DISPONIBLE' });
  });
  await t.test('Historial y auditoría atómicos: rollback de permisos y errores sin secretos', async () => {
    const before = await call(`/${completo.id}`), count = await modelos.curso_accesos_historial.count({ where: { acceso_id: completo.id } });
    const log = console.error; console.error = () => {};
    try {
      for (const model of [modelos.curso_accesos_historial, modelos.auditoria_eventos]) {
        model.addHook('beforeCreate', 'fallo_acceso', () => { throw new Error('SECRETO ERROR'); });
        try { await call(`/${completo.id}/lecciones/${l3.id}`, { method: 'PATCH', body: { estado: 'BLOQUEADA' } }, 500); }
        finally { model.removeHook('beforeCreate', 'fallo_acceso'); }
        assert.deepEqual((await call(`/${completo.id}`)).data.lecciones, before.data.lecciones);
        assert.equal(await modelos.curso_accesos_historial.count({ where: { acceso_id: completo.id } }), count);
      }
    } finally { console.error = log; }
    const events = (await call(`/${completo.id}/historial`)).data;
    assert.ok(events.some(row => row.accion === 'REVOCADO')); assert.ok(events.some(row => row.accion === 'RENOVADO'));
    assert.ok(events.every(row => row.realizado_por === String(admin.id)));
    assert.equal(typeof events[0].datos_despues, 'object'); assert.equal(events[0].datos_antes, null);
    const result = JSON.stringify(events); for (const secret of ['NOTA PRIVADA', 'password_hash', 'HASH PRIVADO', 'ruta_relativa']) assert.ok(!result.includes(secret));
    const page = await call(`/${completo.id}/historial?pagina=1&por_pagina=2&accion=RENOVADO`); assert.equal(page.data.length, 2); assert.ok(page.meta.total >= 2);
    assert.ok(adapter.statements.some(sql => sql.includes('READ COMMITTED'))); assert.ok(adapter.statements.some(sql => sql.includes('FOR UPDATE')));
  });
  await t.test('Sesión revocada antes de confirmar impide la escritura y el historial', async () => {
    const raw = tokenAleatorio(); const sesion = await modelos.usuarios_sesiones.create({ usuario_id: admin.id, token_hash: hashToken(raw), vence_en: new Date(Date.now() + 60000) });
    const req = { user: { id: admin.id }, session: { id: sesion.id }, sessionToken: raw,
      params: { id: completo.id }, body: { motivo: 'No confirmar' } };
    await sesion.update({ revocada_en: literal('UTC_TIMESTAMP(3)') });
    const count = await modelos.curso_accesos_historial.count(); let status, body;
    await Accesos.ER_CursoAcceso_CTS(req, { status(code) { status = code; return this; }, json(value) { body = value; } });
    assert.equal(status, 401, JSON.stringify(body)); assert.equal((await modelos.curso_accesos.findByPk(completo.id)).estado, 'ACTIVO');
    assert.equal(await modelos.curso_accesos_historial.count(), count);
  });
  await t.test('Renovar selección sin archivo físico rechaza sin alterar acceso ni progreso', async () => {
    await unlink(path.join(root, video.ruta_relativa));
    const count = await modelos.curso_accesos_historial.count();
    await call(`/${seleccionado.id}/renovar`, { body: { vence_en: null } }, 422);
    assert.equal(await modelos.curso_accesos_historial.count(), count);
    assert.equal((await modelos.leccion_progreso.findOne({ where: { usuario_id: student.id, leccion_id: l1.id } })).posicion_segundos, 75);
  });
});
