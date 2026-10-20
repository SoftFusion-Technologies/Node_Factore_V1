/* Benjamin Orellana - 19/10/2026 - HTTP administrativo y SQL aislado; sin Mercado Pago ni MySQL DESA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
process.env.NODE_ENV = 'test'; process.env.COOKIE_SECURE = 'false'; process.env.MP_HABILITADO = 'false';
process.env.FRONTEND_URL = 'http://127.0.0.1:5173'; process.env.ALLOWED_ORIGINS = process.env.FRONTEND_URL;
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { tokenAleatorio, hashToken } = await import('../src/utils/password.utils.js');

test('Compras administrativas: pagos, cuentas y entregas separados, solo lectura', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await adapter.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const admin = await m.usuarios.create({ nombre: 'Juan', email: 'juan@compras.invalid', rol: 'ADMIN', estado: 'ACTIVO', password_hash: 'HASH_NO_EXPONER' });
  const client = await m.crm_clientes.create({ nombre: 'Benjamin', email: 'benjamin@compras.invalid' });
  const alumno = await m.usuarios.create({ nombre: 'Benjamin', email: client.email, cliente_id: client.id, rol: 'ALUMNO', estado: 'ACTIVO', password_hash: 'HASH_NO_EXPONER' });
  async function sesion(user) {
    const raw = tokenAleatorio(); await m.usuarios_sesiones.create({ usuario_id: user.id, token_hash: hashToken(raw), vence_en: new Date(Date.now() + 3600000) });
    return 'factore_sid=' + raw;
  }
  const adminCookie = await sesion(admin), alumnoCookie = await sesion(alumno);
  const curso = await m.cursos.create({ titulo: 'Motor actual', slug: 'motor', estado: 'PUBLICADO', creado_por: admin.id });
  const otroCurso = await m.cursos.create({ titulo: 'Kit actual', slug: 'kit', creado_por: admin.id });
  let sequence = 0;
  async function comprar({ estado = 'PENDIENTE', usuario_id = null, vencida = false, creado_en, cursos = [curso], ...extra } = {}) {
    const n = ++sequence;
    const row = await m.compras.create({ referencia: randomUUID(), token_hash: 'a'.repeat(64), solicitud_hash: 'b'.repeat(64),
      comprador_nombre: 'Comprador ' + n, comprador_email: alumno.email, total: cursos.length === 2 ? '700000.20' : '350000.10',
      moneda: 'ARS', estado, usuario_id, vence_en: vencida ? new Date('2020-01-01T00:00:00Z') : new Date(Date.now() + 86400000),
      pagada_en: estado === 'PAGADA' ? new Date() : null,
      creado_en: creado_en || (vencida ? new Date('2019-12-31T23:45:00Z') : new Date()),
      mp_checkout_url: 'https://privado.invalid/no-exponer', ...extra });
    for (const c of cursos) await m.compra_items.create({ compra_id: row.id, curso_id: c.id, titulo: 'Título comprado ' + c.id,
      slug: 'titulo-comprado-' + c.id, precio_unitario: '350000.10', moneda: 'ARS', acceso_duracion_cantidad: 1, acceso_duracion_unidad: 'MESES' });
    return row;
  }
  const pendiente = await comprar(), vencida = await comprar({ vencida: true }), cancelada = await comprar({ estado: 'CANCELADA' });
  const pagada = await comprar({ estado: 'PAGADA', cursos: [curso, otroCurso] });
  const entregada = await comprar({ estado: 'PAGADA', usuario_id: alumno.id, vencida: true });
  const ahora = new Date();
  await m.compra_pagos.create({ compra_id: entregada.id, mp_pago_id: '184057217819', estado: 'approved', detalle_estado: 'accredited',
    validacion: 'VALIDADO', importe: entregada.total, moneda: 'ARS', mp_actualizado_en: ahora, aprobado_en: ahora, verificado_en: ahora });
  await m.auditoria_eventos.create({ usuario_id: alumno.id, accion: 'COMPRA_ENTREGADA', entidad: 'compras', entidad_id: entregada.id,
    detalle: { privado: 'DETALLE_NO_EXPONER' } });
  const acceso = await m.curso_accesos.create({ usuario_id: alumno.id, curso_id: curso.id, alcance: 'COMPLETO', estado: 'REVOCADO',
    inicio_en: new Date('2026-01-01T00:00:00Z'), vence_en: new Date('2026-02-01T00:00:00Z'), asignado_por: admin.id });
  const revision = await comprar({ estado: 'PAGADA' });
  await m.compra_pagos.create({ compra_id: revision.id, mp_pago_id: '184057217820', estado: 'approved', validacion: 'REVISION',
    motivo_revision: 'IMPORTE_DISTINTO', importe: '1.00', moneda: 'ARS', mp_actualizado_en: ahora, verificado_en: ahora });
  const incoherente = await comprar({ estado: 'PAGADA', usuario_id: alumno.id });
  async function get(suffix = '', { cookie = adminCookie, method = 'GET', headers = {} } = {}) {
    const response = await fetch(base + '/api/admin/compras' + suffix, { method,
      headers: { ...(cookie ? { cookie } : {}), ...headers } });
    const body = await response.json(); return { status: response.status, body };
  }
  async function ok(suffix = '') { const res = await get(suffix); assert.equal(res.status, 200, JSON.stringify(res.body)); return res.body; }

  await t.test('Cookie válida, rol ADMIN y contraseña actualizada; una referencia pública no autentica', async () => {
    for (const suffix of ['', '/' + entregada.id]) {
      assert.equal((await get(suffix, { cookie: null, headers: { 'x-user-id': admin.id, authorization: 'Bearer ID-LIBRE' } })).status, 401);
      assert.equal((await get(suffix, { cookie: alumnoCookie })).status, 403);
    }
    await admin.update({ cambiar_password: 1 }); assert.equal((await get()).status, 403);
    await admin.update({ cambiar_password: 0, estado: 'BLOQUEADO' }); assert.equal((await get()).status, 401);
    await admin.update({ estado: 'ACTIVO' });
  });
  await t.test('Listado diferencia vencimiento, pago y entrega; importes congelados y sin secretos', async () => {
    const start = adapter.statements.length, response = await ok();
    const rows = new Map(response.data.map(row => [row.id, row]));
    assert.equal(rows.get(pendiente.id).estado_temporal, 'PENDIENTE');
    assert.equal(rows.get(vencida.id).estado_temporal, 'VENCIDA');
    assert.equal(rows.get(cancelada.id).estado_temporal, 'CANCELADA');
    assert.equal(rows.get(pagada.id).estado_entrega, 'PENDIENTE');
    assert.equal(rows.get(entregada.id).estado_temporal, 'PAGADA');
    assert.equal(rows.get(entregada.id).estado_entrega, 'ENTREGADA');
    assert.equal(rows.get(entregada.id).cantidad_entregas, 1);
    assert.equal(rows.get(incoherente.id).estado_entrega, 'REVISION');
    assert.equal(rows.get(revision.id).pago_en_revision, true);
    assert.equal(rows.get(pagada.id).total, '700000.20'); assert.equal(rows.get(pagada.id).items.length, 2);
    assert.equal(rows.get(pagada.id).items[0].titulo, 'Título comprado ' + curso.id);
    assert.ok(adapter.statements.slice(start).every(sql => /^SELECT\b/i.test(sql)));
    for (const secret of ['token_hash', 'solicitud_hash', 'password_hash', 'mp_checkout_url', 'HASH_NO_EXPONER']) assert.ok(!JSON.stringify(response).includes(secret));
  });
  await t.test('Filtros combinados, SQL escapado y fechas UTC con final exclusivo', async () => {
    assert.deepEqual((await ok('?estado_temporal=VENCIDA')).data.map(row => row.id), [vencida.id]);
    assert.deepEqual((await ok('?estado_entrega=ENTREGADA&usuario_id=' + alumno.id)).data.map(row => row.id), [entregada.id]);
    assert.deepEqual((await ok('?pago_en_revision=1&estado_temporal=PAGADA')).data.map(row => row.id), [revision.id]);
    assert.deepEqual((await ok('?curso_id=' + otroCurso.id)).data.map(row => row.id), [pagada.id]);
    assert.equal((await ok('?q=' + pendiente.referencia)).data[0].id, pendiente.id);
    assert.equal((await ok('?q=' + encodeURIComponent("' OR 1=1 --"))).data.length, 0);
    const limite = '2026-01-15T03:00:00.000Z';
    const enLimite = await comprar({ creado_en: new Date(limite) });
    assert.ok((await ok('?creado_desde=' + limite)).data.some(row => row.id === enLimite.id));
    assert.ok(!(await ok('?creado_hasta=' + limite)).data.some(row => row.id === enLimite.id));
  });
  await t.test('Paginación sin duplicar compras de varios cursos; acceso posterior al registro 100', async () => {
    for (let i = 0; i < 105; i++) await comprar({ comprador_nombre: 'Página ' + String(i).padStart(3, '0') });
    const all = await ok('?q=P%C3%A1gina'); assert.equal(all.data.length, 105); assert.equal(all.meta.paginado, false);
    const page = await ok('?q=P%C3%A1gina&pagina=5&por_pagina=25&ordenar_por=id&direccion=ASC');
    assert.equal(page.meta.total, 105); assert.equal(page.data.length, 5); assert.equal(page.meta.total_paginas, 5);
    const filtered = await ok('?curso_id=' + otroCurso.id + '&pagina=1&por_pagina=1');
    assert.equal(filtered.meta.total, 1); assert.equal(filtered.data.length, 1); assert.equal(filtered.data[0].items.length, 2);
  });
  await t.test('Detalle muestra cuenta coincidente sin confundirla con entrega, ficha y acceso revocado', async () => {
    const start = adapter.statements.length, detail = (await ok('/' + pagada.id)).data;
    assert.equal(detail.usuario, null); assert.equal(detail.estado_entrega, 'PENDIENTE');
    assert.equal(detail.cuenta_por_email.id, alumno.id); assert.equal(detail.cliente.id, client.id);
    assert.equal(detail.items[0].acceso_actual.id, acceso.id);
    assert.equal(detail.items[0].acceso_actual.estado_temporal, 'REVOCADO');
    assert.equal(detail.items[0].acceso_actual.requiere_revision_para_asignar, true);
    assert.equal(detail.items[1].acceso_actual, null);
    const paid = (await ok('/' + entregada.id)).data;
    assert.equal(paid.pagos[0].mp_pago_id, '184057217819'); assert.equal(paid.pagos[0].importe, '350000.10');
    assert.equal(paid.eventos[0].accion, 'COMPRA_ENTREGADA');
    for (const secret of ['token_hash', 'solicitud_hash', 'password_hash', 'mp_checkout_url', 'DETALLE_NO_EXPONER']) assert.ok(!JSON.stringify(paid).includes(secret));
    assert.ok(adapter.statements.slice(start).every(sql => /^SELECT\b/i.test(sql)));
    await acceso.update({ estado: 'ACTIVO' });
    const expired = (await ok('/' + pagada.id)).data.items[0].acceso_actual;
    assert.equal(expired.estado_temporal, 'VENCIDO'); assert.equal(expired.requiere_revision_para_asignar, false);
  });
  await t.test('Cuenta inexistente no se crea, compra desconocida 404 y parámetros inválidos 422', async () => {
    const nueva = await comprar({ comprador_email: 'sin-cuenta@compras.invalid' });
    const before = await m.usuarios.count();
    const data = (await ok('/' + nueva.id)).data;
    assert.equal(data.cuenta_por_email, null); assert.equal(data.cliente, null); assert.equal(await m.usuarios.count(), before);
    assert.equal((await get('/999999999')).status, 404);
    for (const suffix of ['/0', '/9007199254740993?token=libre', '/1?estado=PAGADA', '?token=libre', '?estado_temporal=ACTIVO',
      '?usuario_id=1%20OR%201=1', '?curso_id=1%27', '?q=a&q=b', '?pagina=0', '?ordenar_por=token_hash',
      '?creado_desde=2026-02-30T00:00:00Z', '?creado_desde=2026-01-01T00:00:00Z&creado_hasta=2026-01-01T00:00:00Z']) {
      assert.equal((await get(suffix)).status, 422, suffix);
    }
  });
  await t.test('Recibos duplicados o de otra cuenta requieren revisión; las compras ajenas quedan aisladas', async () => {
    const incorrecta = await comprar({ estado: 'PAGADA', usuario_id: alumno.id });
    await m.auditoria_eventos.create({ usuario_id: admin.id, accion: 'COMPRA_ENTREGADA', entidad: 'compras', entidad_id: incorrecta.id });
    assert.equal((await ok('/' + incorrecta.id)).data.estado_entrega, 'REVISION');
    const evento = await m.auditoria_eventos.create({ usuario_id: alumno.id, accion: 'COMPRA_ENTREGADA', entidad: 'compras', entidad_id: entregada.id });
    const duplicada = (await ok('/' + entregada.id)).data;
    assert.equal(duplicada.estado_entrega, 'REVISION'); assert.equal(duplicada.cantidad_entregas, 2);
    assert.ok(duplicada.pagos.every(pago => pago.compra_id === entregada.id));
    assert.equal(duplicada.eventos.length, 2);
    await evento.destroy();
  });
  await t.test('BIGINT exacto, ausencia de operaciones de escritura y sesión revocada', async () => {
    const grande = await comprar({ id: '9007199254740993' });
    assert.equal((await ok('/' + grande.id)).data.id, '9007199254740993');
    assert.equal((await ok('?ordenar_por=id&direccion=DESC&pagina=1&por_pagina=1')).data[0].id, '9007199254740993');
    for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await get('/' + entregada.id, { method })).status, 404);
    await m.usuarios_sesiones.update({ revocada_en: new Date() }, { where: { usuario_id: admin.id } });
    assert.equal((await get()).status, 401);
  });
});
