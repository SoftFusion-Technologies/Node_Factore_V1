import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, unlink, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { literal } from 'sequelize';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import * as Cursos from '../src/Controllers/Campus/CTS_CampusCursos.js';
import * as Materiales from '../src/Controllers/Campus/CTS_CampusMateriales.js';
import * as Progreso from '../src/Controllers/Campus/CTS_CampusProgreso.js';
import * as Comercios from '../src/Controllers/Campus/CTS_CampusComercios.js';
import * as Archivos from '../src/Controllers/Campus/CTS_CampusArchivos.js';
import * as Auth from '../src/Controllers/Usuario/CTS_Auth.js';
import { hashPassword } from '../src/utils/password.utils.js';
import { conectarPrueba } from './adapter-crm.js';

test('Campus: cookies HTTP, vistas de permisos, archivos privados y progreso con SQLite aislado', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'factore-campus-')), previousStorage = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = root;
  for (const folder of ['videos', 'imagenes', 'documentos']) await mkdir(path.join(root, folder), { mode: 0o700 });
  const password = 'Clave aislada del campus Factor E 2026', hash = await hashPassword(password);
  const admin = await modelos.usuarios.create({ nombre: 'Juan', email: 'juan@example.invalid', rol: 'ADMIN', estado: 'ACTIVO', password_hash: hash });
  async function usuario(name) {
    const c = await modelos.crm_clientes.create({ nombre: name, observaciones_internas: 'CRM PRIVADO' });
    const u = await modelos.usuarios.create({ nombre: name, email: name.toLowerCase() + '@example.invalid', rol: 'ALUMNO', estado: 'ACTIVO', cliente_id: c.id, password_hash: hash });
    return { u, c };
  }
  const one = await usuario('AlumnoUno'), two = await usuario('AlumnoDos'), sinCurso = await usuario('SinCurso');
  async function archivo(tipo, bytes, overrides = {}) {
    const uuid = randomUUID(), extension = { VIDEO: 'mp4', IMAGEN: 'png', DOCUMENTO: 'pdf' }[tipo], folder = { VIDEO: 'videos', IMAGEN: 'imagenes', DOCUMENTO: 'documentos' }[tipo];
    const relative = `${folder}/${uuid}.${extension}`; await writeFile(path.join(root, relative), bytes, { mode: 0o600 });
    return modelos.archivos.create({ uuid, tipo, extension, ruta_relativa: relative, nombre_guardado: `${uuid}.${extension}`, nombre_original: `clase.${extension}`,
      mime_type: { VIDEO: 'video/mp4', IMAGEN: 'image/png', DOCUMENTO: 'application/pdf' }[tipo], tamanio_bytes: String(bytes.length),
      sha256: 'HASH PRIVADO CAMPUS', estado: 'DISPONIBLE', subido_por: admin.id, ...overrides });
  }
  const videoBytes = Buffer.alloc(256, 7); videoBytes.writeUInt32BE(16, 0); videoBytes.write('ftyp', 4);
  const video = await archivo('VIDEO', videoBytes, { duracion_segundos: 100 });
  const image = await archivo('IMAGEN', Buffer.alloc(32, 1));
  const document = await archivo('DOCUMENTO', Buffer.from('%PDF-1.4\nDocumento Factor E\n'));
  async function contenido(titulo, alumno = one.u) {
    const c = await modelos.cursos.create({ titulo, slug: titulo.toLowerCase().replaceAll(' ', '-'), estado: 'PUBLICADO', creado_por: admin.id, portada_archivo_id: image.id, visible_catalogo: 0 });
    const m = await modelos.curso_modulos.create({ curso_id: c.id, titulo: 'Módulo visible', orden: 1 });
    const l = await modelos.curso_lecciones.create({ curso_id: c.id, modulo_id: m.id, titulo: 'Lección visible', estado: 'PUBLICADA', video_archivo_id: video.id, portada_archivo_id: image.id, orden: 1 });
    const a = await modelos.curso_accesos.create({ usuario_id: alumno.id, curso_id: c.id, asignado_por: admin.id, observaciones_internas: 'ACCESO PRIVADO' });
    return { c, m, l, a };
  }
  const principal = await contenido('Curso Factor E'), seleccion = await contenido('Curso seleccionado'), ajeno = await contenido('Curso ajeno', two.u);
  const l2 = await modelos.curso_lecciones.create({ curso_id: principal.c.id, modulo_id: principal.m.id, titulo: 'Segunda lección', estado: 'PUBLICADA', video_archivo_id: video.id, orden: 2 });
  const bloqueada = await modelos.curso_lecciones.create({ curso_id: principal.c.id, modulo_id: principal.m.id, titulo: 'VIDEO BLOQUEADO PRIVADO', estado: 'PUBLICADA', video_archivo_id: video.id });
  const borrador = await modelos.curso_lecciones.create({ curso_id: principal.c.id, modulo_id: principal.m.id, titulo: 'BORRADOR PRIVADO', video_archivo_id: video.id });
  const oculto = await modelos.curso_modulos.create({ curso_id: principal.c.id, titulo: 'MODULO PRIVADO', estado: 'ARCHIVADO' });
  await modelos.curso_lecciones.create({ curso_id: principal.c.id, modulo_id: oculto.id, titulo: 'LECCION MODULO PRIVADO', estado: 'PUBLICADA', video_archivo_id: video.id });
  await modelos.curso_acceso_lecciones.create({ acceso_id: principal.a.id, curso_id: principal.c.id, leccion_id: bloqueada.id, estado: 'BLOQUEADA' });
  await seleccion.a.update({ alcance: 'SELECCION' });
  const elegida = await modelos.curso_acceso_lecciones.create({ acceso_id: seleccion.a.id, curso_id: seleccion.c.id, leccion_id: seleccion.l.id });
  const futura = await modelos.curso_lecciones.create({ curso_id: seleccion.c.id, modulo_id: seleccion.m.id, titulo: 'VIDEO FUTURO PRIVADO', estado: 'PUBLICADA', video_archivo_id: video.id });
  await modelos.curso_acceso_lecciones.create({ acceso_id: seleccion.a.id, curso_id: seleccion.c.id, leccion_id: futura.id, inicio_en: '2099-01-01T00:00:00.000Z' });
  const noElegida = await modelos.curso_lecciones.create({ curso_id: seleccion.c.id, modulo_id: seleccion.m.id, titulo: 'VIDEO NO SELECCIONADO', estado: 'PUBLICADA', video_archivo_id: video.id });
  const general = await modelos.curso_materiales.create({ curso_id: principal.c.id, archivo_id: document.id, titulo: 'Material general' });
  const specific = await modelos.curso_materiales.create({ curso_id: principal.c.id, leccion_id: principal.l.id, archivo_id: document.id, titulo: 'Material de lección' });
  const deniedMaterial = await modelos.curso_materiales.create({ curso_id: principal.c.id, leccion_id: bloqueada.id, archivo_id: document.id, titulo: 'MATERIAL PRIVADO' });
  const friend = await modelos.comercios_amigos.create({ nombre: 'Comercio visible', slug: 'comercio-visible', mostrar_a_usuarios: 1,
    logo_archivo_id: image.id, rubro: 'Consultoría', ciudad: 'Tucumán', observaciones_internas: 'COMERCIO PRIVADO' });
  const hidden = await modelos.comercios_amigos.create({ nombre: 'COMERCIO OCULTO', slug: 'comercio-oculto', logo_archivo_id: image.id });
  await modelos.comercio_clientes.create({ comercio_id: friend.id, cliente_id: one.c.id, funcion: 'CONTACTO PRIVADO' });
  let server, base, jar, jarTwo, jarNone, jarAdmin;
  const streams = new Map();
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (previousStorage === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = previousStorage;
    await adapter.close(); await rm(root, { recursive: true, force: true });
  });
  server = createServer(async (req, res) => {
    if (req.headers['x-test-stream']) streams.set(req.headers['x-test-stream'], res);
    res.status = code => { res.statusCode = code; return res; }; res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; };
    req.ip = req.socket.remoteAddress; const url = new URL(req.url, 'http://test'); req.query = Object.fromEntries(url.searchParams); req.params = {};
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { const chunks = []; for await (const chunk of req) chunks.push(chunk); req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
      if (url.pathname === '/api/auth/login') return Auth.LOGIN_CTS(req, res);
      if (url.pathname === '/api/campus/cursos') return Cursos.OBRS_MisCursos_CTS(req, res);
      const course = /^\/api\/campus\/cursos\/([^/]+)(?:\/(progreso|portada|materiales|lecciones))?(?:\/([^/]+))?(?:\/(video|portada|progreso))?$/.exec(url.pathname);
      if (course) {
        req.params = { curso_id: course[1], leccion_id: course[3], material_id: course[3] };
        let handler;
        if (course[4] === 'video') handler = Archivos.OBRS_VideoCampus_CTS;
        else if (course[4] === 'portada') handler = Archivos.OBRS_PortadaLeccionCampus_CTS;
        else if (course[4] === 'progreso') handler = Progreso.UR_MiProgresoLeccion_CTS;
        else if (course[2] === 'portada') handler = Archivos.OBRS_PortadaCursoCampus_CTS;
        else if (course[2] === 'progreso') handler = Progreso.OBRS_MiProgresoCurso_CTS;
        else if (course[2] === 'materiales') handler = course[3] ? Archivos.OBRS_MaterialCampus_CTS : Materiales.OBRS_MisMateriales_CTS;
        else if (course[2] === 'lecciones') handler = Cursos.OBRS_MiLeccion_CTS;
        else handler = Cursos.OBRS_DetMiCurso_CTS;
        return handler(req, res);
      }
      const commerce = /^\/api\/campus\/comercios(?:\/([^/]+))?(?:\/(logo))?$/.exec(url.pathname);
      if (commerce) { req.params = { comercio_id: commerce[1] }; return (commerce[2] ? Archivos.OBRS_LogoComercioCampus_CTS
        : commerce[1] ? Comercios.OBRS_DetComercioCampus_CTS : Comercios.OBRS_ComerciosCampus_CTS)(req, res); }
      res.status(404).json({ error: 'Ruta inexistente' });
    } catch (error) { if (res.headersSent) return res.destroy(); res.status(500).json({ error: error.name }); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  async function login(u) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password }) });
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value));
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: value.data.csrf_token };
  }
  async function send(url, { currentJar = jar, body, method = body === undefined ? 'GET' : 'PATCH', headers = {} } = {}) {
    return fetch(base + '/api/campus' + url, { method, headers: { ...(currentJar ? { cookie: currentJar.cookie, 'x-csrf-token': currentJar.csrf } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function json(url, options = {}, status = 200) { const res = await send(url, options), value = await res.json(); assert.equal(res.status, status, JSON.stringify(value)); return value; }
  const cp = () => `/cursos/${principal.c.id}`, lp = () => cp() + `/lecciones/${principal.l.id}`, sp = () => `/cursos/${seleccion.c.id}`;

  await t.test('Identidad de cookie, rol alumno y aislamiento de cursos, sin confiar en IDs o cabeceras', async () => {
    await json('/cursos', { currentJar: null, headers: { 'x-user-id': one.u.id } }, 401);
    jar = await login(one.u); jarTwo = await login(two.u); jarNone = await login(sinCurso.u); jarAdmin = await login(admin);
    await json('/cursos', { currentJar: jarAdmin }, 403);
    assert.equal((await json('/cursos', { currentJar: jarNone })).data.length, 0);
    assert.equal((await json('/cursos')).data.length, 2);
    const own = (await json('/cursos', { headers: { 'x-user-id': two.u.id } })).data; assert.ok(own.every(row => row.id !== String(ajeno.c.id)));
    await json('/cursos?usuario_id=' + two.u.id, {}, 422);
    await json(`/cursos/${ajeno.c.id}`, {}, 404);
    await json(`/cursos/${ajeno.c.id}/lecciones/${ajeno.l.id}/video`, {}, 404);
    await json(cp(), { currentJar: jarTwo }, 404);
  });
  await t.test('Curso y lección muestran solo módulos habilitados y campos del campus', async () => {
    const value = await json(cp()); assert.equal(value.data.modulos.length, 1); assert.equal(value.data.modulos[0].lecciones.length, 2);
    assert.equal(value.data.progreso.lecciones_habilitadas, 2); assert.equal(value.data.progreso.porcentaje, 0);
    const lesson = (await json(lp())).data; assert.equal(lesson.progreso.estado, 'SIN_INICIAR'); assert.equal(lesson.duracion_segundos, 100);
    for (const l of [bloqueada, borrador]) await json(cp() + `/lecciones/${l.id}`, {}, 404);
    const text = JSON.stringify(value); for (const secret of ['PRIVADO', 'BORRADOR', 'password_hash', 'token_hash', 'ruta_relativa', 'HASH PRIVADO', 'asignado_por', 'usuario_id']) assert.ok(!text.includes(secret));
    assert.equal((await json('/cursos')).data[0].titulo, principal.c.titulo); // El catálogo oculto no quita una asignación válida.
  });
  await t.test('Selección respeta fechas propias y no expone videos no elegidos', async () => {
    const detail = (await json(sp())).data; assert.equal(detail.modulos[0].lecciones.length, 1);
    for (const lesson of [futura, noElegida]) { await json(sp() + `/lecciones/${lesson.id}`, {}, 404); await json(sp() + `/lecciones/${lesson.id}/video`, {}, 404); }
    await json(cp() + `/lecciones/${seleccion.l.id}/video`, {}, 404);
  });
  await t.test('Video privado: GET, HEAD y rangos correctos con autorización en cada solicitud', async () => {
    let res = await send(lp() + '/video'); assert.equal(res.status, 200); assert.deepEqual(Buffer.from(await res.arrayBuffer()), videoBytes);
    assert.equal(res.headers.get('content-type'), 'video/mp4'); assert.equal(res.headers.get('cache-control'), 'private, no-store');
    res = await send(lp() + '/video', { method: 'HEAD' }); assert.equal(res.status, 200); assert.equal(res.headers.get('content-length'), '256'); assert.equal((await res.arrayBuffer()).byteLength, 0);
    res = await send(lp() + '/video', { headers: { range: 'bytes=4-15' } }); assert.equal(res.status, 206); assert.equal(res.headers.get('content-range'), 'bytes 4-15/256'); assert.deepEqual(Buffer.from(await res.arrayBuffer()), videoBytes.subarray(4, 16));
    res = await send(lp() + '/video', { headers: { range: 'bytes=-8' } }); assert.equal(res.status, 206); assert.equal((await res.arrayBuffer()).byteLength, 8);
    for (const range of ['bytes=999-1000', 'bytes=0-2,4-5', 'bytes=-0']) { res = await send(lp() + '/video', { headers: { range } }); assert.equal(res.status, 416); assert.equal(res.headers.get('content-range'), 'bytes */256'); await res.arrayBuffer(); }
    await json(lp() + '/video?archivo_id=' + document.id, {}, 422);
  });
  await t.test('Portadas y logos siguen su asociación y no dan acceso a archivos libres', async () => {
    for (const url of [cp() + '/portada', lp() + '/portada', `/comercios/${friend.id}/logo`]) { const res = await send(url); assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/png'); assert.equal((await res.arrayBuffer()).byteLength, 32); }
    await json(`/comercios/${hidden.id}/logo`, {}, 404);
    await image.update({ estado: 'SUBIENDO' });
    assert.equal((await json(`/comercios/${friend.id}`)).data.logo_archivo_id, null);
    await json(`/comercios/${friend.id}/logo`, {}, 404); await image.update({ estado: 'DISPONIBLE' });
    await principal.c.update({ portada_archivo_id: null }); await json(cp() + '/portada', {}, 404); await principal.c.update({ portada_archivo_id: image.id });
    await json('/archivos/' + video.id, {}, 404);
  });
  await t.test('Material general o por lección; inactivo o bloqueado no se lista ni descarga', async () => {
    const all = await json(cp() + '/materiales'); assert.equal(all.data.length, 2);
    assert.equal((await json(cp() + '/materiales?generales=true')).data.length, 1);
    assert.equal((await json(cp() + '/materiales?leccion_id=' + principal.l.id)).data.length, 1);
    await json(cp() + '/materiales?leccion_id=' + bloqueada.id, {}, 404);
    await json(cp() + '/materiales?generales=true&leccion_id=' + principal.l.id, {}, 422);
    const res = await send(cp() + `/materiales/${general.id}`); assert.equal(res.status, 200); assert.match(res.headers.get('content-disposition'), /^attachment;/); assert.match(await res.text(), /^%PDF/);
    await json(cp() + `/materiales/${deniedMaterial.id}`, {}, 404);
    await specific.update({ activo: 0 }); await json(cp() + `/materiales/${specific.id}`, {}, 404); assert.equal((await json(cp() + '/materiales')).data.length, 1); await specific.update({ activo: 1 });
  });
  await t.test('Posición y finalización propias: CSRF, límites y lección completada no se desmarca', async () => {
    const url = lp() + '/progreso';
    await json(url, {}, 405);
    await json(url, { body: { posicion_segundos: 9 }, headers: { 'content-type': 'text/plain' } }, 415);
    await json(url, { body: { posicion_segundos: 9 }, headers: { 'x-csrf-token': 'incorrecto' } }, 403);
    await json(url, { body: { posicion_segundos: 9 }, headers: { origin: 'https://otro.example.invalid' } }, 403);
    for (const body of [{ usuario_id: two.u.id, posicion_segundos: 1 }, { estado: 'COMPLETADA' }, { completada_en: '2026-01-01' }, { posicion_segundos: -1 }, { posicion_segundos: 1.5 }, { posicion_segundos: 101 }]) await json(url, { body }, 422);
    const first = (await json(url, { body: { posicion_segundos: 33 } })).data; assert.equal(first.estado, 'EN_CURSO');
    const done = (await json(url, { body: { completada: true, posicion_segundos: 100 } })).data; assert.equal(done.estado, 'COMPLETADA'); assert.ok(done.completada_en);
    const again = (await json(url, { body: { completada: false, posicion_segundos: 25 } })).data; assert.equal(again.estado, 'COMPLETADA'); assert.equal(again.completada_en, done.completada_en); assert.equal(again.id, first.id);
    assert.equal(await modelos.auditoria_eventos.count({ where: { accion: 'LECCION_COMPLETADA', usuario_id: one.u.id } }), 1);
    const p = (await json(cp() + '/progreso')).data; assert.equal(p.lecciones_completadas, 1); assert.equal(p.porcentaje, 50); assert.equal(p.retomar.leccion_id, String(principal.l.id)); assert.equal(p.retomar.posicion_segundos, 25);
    await json(url, { body: { posicion_segundos: 8 }, currentJar: jarTwo }, 404);
  });
  await t.test('Fallo de auditoría revierte la finalización sin revelar detalles internos', async () => {
    const url = cp() + `/lecciones/${l2.id}/progreso`; await json(url, { body: { posicion_segundos: 10 } });
    modelos.auditoria_eventos.addHook('beforeCreate', 'fallo_campus', () => { throw new Error('ERROR PRIVADO'); });
    const logger = console.error; console.error = () => {};
    try { const result = await json(url, { body: { completada: true } }, 500); assert.ok(!JSON.stringify(result).includes('ERROR PRIVADO')); }
    finally { modelos.auditoria_eventos.removeHook('beforeCreate', 'fallo_campus'); console.error = logger; }
    const row = await modelos.leccion_progreso.findOne({ where: { usuario_id: one.u.id, leccion_id: l2.id } }); assert.equal(row.estado, 'EN_CURSO'); assert.equal(row.posicion_segundos, 10); assert.equal(row.completada_en, null);
  });
  await t.test('Progreso conserva historial al bloquear, revocar y renovar; porcentaje usa lecciones habilitadas', async () => {
    const exception = await modelos.curso_acceso_lecciones.create({ acceso_id: principal.a.id, curso_id: principal.c.id, leccion_id: l2.id, estado: 'BLOQUEADA' });
    assert.equal((await json(cp() + '/progreso')).data.porcentaje, 100); await exception.destroy();
    const extra = await modelos.curso_lecciones.create({ curso_id: principal.c.id, modulo_id: principal.m.id, titulo: 'Nueva publicada', estado: 'PUBLICADA', video_archivo_id: video.id });
    assert.equal((await json(cp() + '/progreso')).data.porcentaje, 33.33); await extra.update({ estado: 'ARCHIVADA' });
    await principal.a.update({ estado: 'REVOCADO' });
    for (const url of [cp(), lp(), cp() + '/progreso', cp() + '/materiales', cp() + `/materiales/${general.id}`, lp() + '/video']) await json(url, {}, 404);
    await json(lp() + '/progreso', { body: { posicion_segundos: 1 } }, 404);
    assert.equal((await modelos.leccion_progreso.findOne({ where: { usuario_id: one.u.id, leccion_id: principal.l.id } })).estado, 'COMPLETADA');
    await principal.a.update({ estado: 'ACTIVO', vence_en: null }); const renewed = (await json(lp())).data; assert.equal(renewed.progreso.estado, 'COMPLETADA'); assert.equal(renewed.progreso.posicion_segundos, 25);
  });
  await t.test('Inicio y vencimiento UTC, curso archivado y excepciones se aplican sin cron', async () => {
    await principal.a.update({ inicio_en: '2099-01-01T00:00:00.000Z' }); await json(cp(), {}, 404); await principal.a.update({ inicio_en: '2000-01-01T00:00:00.000Z', vence_en: literal('UTC_TIMESTAMP(3)') }); await json(lp() + '/video', {}, 404);
    await principal.a.update({ vence_en: null });
    await principal.c.update({ estado: 'ARCHIVADO' }); await json(cp(), {}, 404); await principal.c.update({ estado: 'PUBLICADO' });
    await elegida.update({ vence_en: literal('UTC_TIMESTAMP(3)') }); await json(sp(), {}, 404); await json(sp() + `/lecciones/${seleccion.l.id}/video`, {}, 404); await elegida.update({ vence_en: null });
    await principal.a.update({ estado: 'SUSPENDIDO' }); await json(cp(), {}, 404); await principal.a.update({ estado: 'ACTIVO' });
  });
  await t.test('Comercios visibles sin cursos: campos públicos, filtros y ocultación inmediata', async () => {
    const all = await json('/comercios', { currentJar: jarNone }); assert.equal(all.data.length, 1);
    const text = JSON.stringify(all); for (const secret of ['observaciones_internas', 'clientes', 'CONTACTO PRIVADO', 'COMERCIO PRIVADO', 'COMERCIO OCULTO']) assert.ok(!text.includes(secret));
    assert.equal((await json('/comercios?rubro=' + encodeURIComponent('Consultoría') + '&ciudad=' + encodeURIComponent('Tucumán'))).data.length, 1);
    await friend.update({ mostrar_a_usuarios: 0 }); assert.equal((await json('/comercios')).data.length, 0); await json(`/comercios/${friend.id}`, {}, 404); await json(`/comercios/${friend.id}/logo`, {}, 404); await friend.update({ mostrar_a_usuarios: 1 });
    await friend.update({ activo: 0 }); await json(`/comercios/${friend.id}/logo`, {}, 404); await friend.update({ activo: 1 });
  });
  await t.test('Listados de 111 cursos, comercios y materiales sin recortes implícitos', async () => {
    for (let n = 0; n < 109; n++) await contenido(`Demo curso ${n}`);
    const all = await json('/cursos'); assert.equal(all.data.length, 111); assert.equal(all.meta.paginado, false);
    const page = await json('/cursos?pagina=2&por_pagina=10&q=Demo'); assert.equal(page.data.length, 10); assert.equal(page.meta.total, 109);
    assert.equal((await json('/cursos?q=' + encodeURIComponent("x' OR 1=1 --"))).data.length, 0);
    for (let n = 0; n < 110; n++) await modelos.comercios_amigos.create({ nombre: `Demo comercio ${n}`, slug: `demo-comercio-${n}`, mostrar_a_usuarios: 1 });
    assert.equal((await json('/comercios')).data.length, 111);
    for (let n = 0; n < 109; n++) await modelos.curso_materiales.create({ curso_id: principal.c.id, titulo: `Guía ${n}`, archivo_id: document.id });
    assert.equal((await json(cp() + '/materiales')).data.length, 111);
    assert.equal((await json(cp() + '/materiales?pagina=2&por_pagina=10')).meta.total, 111);
    for (const q of ['limit=100', 'por_pagina=501', 'ordenar_por=password_hash', 'usuario_id=2']) await json('/cursos?' + q, {}, 422);
  });
  await t.test('Cuenta, cliente y sesión bloqueados o vencidos cortan todo el campus', async () => {
    await one.u.update({ cambiar_password: 1 }); await json('/cursos', {}, 403); await json(lp() + '/video', {}, 403); await one.u.update({ cambiar_password: 0 });
    await one.c.update({ activo: 0 }); await json('/comercios', {}, 401); await one.c.update({ activo: 1 });
    await one.u.update({ estado: 'BLOQUEADO' }); await json(lp() + '/video', {}, 401); await one.u.update({ estado: 'ACTIVO' });
    const session = await modelos.usuarios_sesiones.findOne({ where: { usuario_id: one.u.id, revocada_en: null } });
    await session.update({ vence_en: literal('UTC_TIMESTAMP(3)') }); await json('/cursos', {}, 401); jar = await login(one.u);
    const current = await modelos.usuarios_sesiones.findOne({ where: { usuario_id: one.u.id }, order: [['id', 'DESC']] });
    await current.update({ revocada_en: literal('UTC_TIMESTAMP(3)') }); await json(lp() + '/video', {}, 401); jar = await login(one.u);
  });
  await t.test('Archivo alterado, ausente o symlink no se transmite ni permite guardar progreso', async () => {
    const full = path.join(root, video.ruta_relativa); await writeFile(full, 'alterado');
    await json(lp() + '/video', {}, 409); await json(lp() + '/progreso', { body: { posicion_segundos: 1 } }, 409);
    await unlink(full); await json(lp() + '/video', {}, 404);
    const outside = path.join(root, 'externo.mp4'); await writeFile(outside, videoBytes); await symlink(outside, full); await json(lp() + '/video', {}, 404);
    await unlink(full); await writeFile(full, videoBytes);
    assert.ok(adapter.statements.some(sql => sql.includes('vw_campus_lecciones_habilitadas')));
    assert.ok(adapter.statements.some(sql => sql.includes('READ COMMITTED')));
  });

  async function transferenciaLenta(url, cambiar, esperaMax = 6000) {
    return new Promise((resolve, reject) => {
      let started = false, canceled = false;
      const marker = randomUUID();
      const timeout = setTimeout(() => { canceled = true; req.destroy(); reject(new Error('La transmisión siguió abierta sin permiso.')); }, esperaMax);
      const req = request(base + '/api/campus' + url, { headers: { cookie: jar.cookie, 'x-test-stream': marker } });
      req.once('response', res => {
        if (res.statusCode !== 200) { canceled = true; clearTimeout(timeout); req.destroy(); return reject(new Error('Estado de transmisión: ' + res.statusCode)); }
        res.pause();
        const serverRes = streams.get(marker);
        serverRes.once('close', () => { clearTimeout(timeout); streams.delete(marker); req.destroy(); if (!canceled) resolve({ aborted: !serverRes.writableFinished }); });
        started = true;
        cambiar().catch(error => { canceled = true; clearTimeout(timeout); req.destroy(); reject(error); });
      });
      req.once('error', error => { if (!started && !canceled) { clearTimeout(timeout); reject(error); } }); req.end();
      // Observar el cierre del servidor: un cliente pausado puede conservar bytes ya almacenados en su socket.
    });
  }
  await t.test('Revocación durante video y documento largos corta la transmisión en curso', async () => {
    const bytes = Buffer.alloc(32 * 1024 * 1024, 5); bytes.writeUInt32BE(16, 0); bytes.write('ftyp', 4);
    const large = await archivo('VIDEO', bytes); await principal.l.update({ video_archivo_id: large.id });
    const videoResult = await transferenciaLenta(lp() + '/video', () => principal.a.update({ estado: 'REVOCADO' })); assert.equal(videoResult.aborted, true);
    await principal.a.update({ estado: 'ACTIVO' });
    const docBytes = Buffer.alloc(32 * 1024 * 1024, 1); docBytes.write('%PDF-1.4', 0); const largeDoc = await archivo('DOCUMENTO', docBytes); await general.update({ archivo_id: largeDoc.id });
    const docResult = await transferenciaLenta(cp() + `/materiales/${general.id}`, () => principal.a.update({ estado: 'REVOCADO' })); assert.equal(docResult.aborted, true);
    await principal.a.update({ estado: 'ACTIVO' }); await general.update({ archivo_id: document.id });
  });
  await t.test('Vencimiento cercano corta el video y una renovación evita un corte prematuro', async () => {
    await principal.a.update({ estado: 'ACTIVO', vence_en: new Date(Date.now() + 500) });
    const expired = await transferenciaLenta(lp() + '/video', async () => {}); assert.equal(expired.aborted, true);
    await principal.a.update({ vence_en: new Date(Date.now() + 500) });
    const observed = await new Promise((resolve, reject) => {
      const marker = randomUUID();
      const req = request(base + '/api/campus' + lp() + '/video', { headers: { cookie: jar.cookie, 'x-test-stream': marker } });
      req.once('response', res => {
        if (res.statusCode !== 200) { req.destroy(); return reject(new Error('Estado de transmisión: ' + res.statusCode)); }
        res.pause();
        const serverRes = streams.get(marker);
        principal.a.update({ vence_en: new Date(Date.now() + 10000) }).then(() => {
          setTimeout(() => { const open = !serverRes.destroyed; streams.delete(marker); req.destroy(); resolve(open); }, 1200);
        }, error => { req.destroy(); reject(error); });
      }); req.once('error', reject); req.end();
    });
    assert.equal(observed, true); await principal.a.update({ vence_en: null });
  });
});
