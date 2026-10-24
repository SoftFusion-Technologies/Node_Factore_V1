/* Benjamin Orellana - 24/10/2026 - Compra de Agenda con HTTP, webhook firmado y MP simulado. Sin dinero real. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
Object.assign(process.env, { NODE_ENV: 'test', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax', TRUST_PROXY: 'false',
  ALLOWED_ORIGINS: 'http://127.0.0.1:5173', FRONTEND_URL: 'http://127.0.0.1:5173',
  MP_HABILITADO: 'true', MP_MODO: 'PRUEBA', MP_ACCESS_TOKEN: 'TEST-ficticio-no-utilizable',
  MP_COLLECTOR_ID: '123456', MP_WEBHOOK_SECRET: 'Secreto-ficticio-para-pruebas-Agenda-20261024',
  MP_FRONTEND_URL: 'https://front.example.invalid', MP_NOTIFICATION_URL: 'https://front.example.invalid/api/mercadopago/webhook' });
const { default: db } = await import('../src/DataBase/db.js');
const { modelos: m } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');
const { hashPassword } = await import('../src/utils/password.utils.js');
const { fecha } = await import('../src/Services/Pago/mercadoPago.service.js');
const { reconciliarCompra } = await import('../src/Services/Compra/reconciliacionCompra.service.js');

test('Compra de Agenda: pago verificado y entrega automática sin asignación manual', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql', extras: ['agenda.sqlite.sql', 'agenda-venta.sqlite.sql'] });
  const password = 'Agenda Compra 2026';
  const password_hash = await hashPassword(password);
  const admin = await m.usuarios.create({ nombre: 'Juan', email: 'juan@agenda.invalid', rol: 'ADMIN', estado: 'ACTIVO', cambiar_password: 0, password_hash });
  async function alumno(nombre) {
    const cliente = await m.crm_clientes.create({ nombre });
    return m.usuarios.create({ nombre, email: nombre.toLowerCase() + '@agenda.invalid', cliente_id: cliente.id,
      rol: 'ALUMNO', estado: 'ACTIVO', cambiar_password: 0, password_hash });
  }
  const ana = await alumno('Ana'), luz = await alumno('Luz');
  const server = crearApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port, originalFetch = globalThis.fetch;
  const preferences = new Map(), payments = new Map(), orders = new Map();
  let posts = 0, sequence = 12000, perderRespuesta = false;
  const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, options = {}) => {
    const target = new URL(url);
    if (target.origin === base) return originalFetch(url, options);
    assert.equal(target.origin, 'https://api.mercadopago.com');
    if (options.method === 'POST') {
      assert.equal(target.pathname, '/checkout/preferences'); posts++;
      const body = JSON.parse(options.body), pref = { ...body, id: 'pref-' + (++sequence), collector_id: 123456 };
      pref.sandbox_init_point = 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=' + pref.id;
      preferences.set(pref.external_reference, pref);
      if (perderRespuesta) throw new Error('Respuesta perdida después de crear');
      return json(pref);
    }
    assert.equal(options.method, 'GET');
    if (target.pathname === '/checkout/preferences/search') {
      const pref = preferences.get(target.searchParams.get('external_reference'));
      return json({ total: pref ? 1 : 0, elements: pref ? [{ id: pref.id }] : [], next_offset: null });
    }
    if (target.pathname.startsWith('/checkout/preferences/')) return json([...preferences.values()].find(p => p.id === target.pathname.split('/').at(-1)));
    if (target.pathname === '/v1/payments/search') return json({ results: [...payments.values()].filter(p => p.external_reference === target.searchParams.get('external_reference')), paging: { total: [...payments.values()].filter(p => p.external_reference === target.searchParams.get('external_reference')).length, offset: 0, limit: 100 } });
    if (target.pathname.startsWith('/v1/payments/')) return json(payments.get(target.pathname.split('/').at(-1)));
    if (target.pathname.startsWith('/merchant_orders/')) return json(orders.get(target.pathname.split('/').at(-1)));
    throw new Error('Consulta no contemplada: ' + target.pathname);
  };
  t.after(async () => { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(r => server.close(r)); await adapter.close(); });
  async function request(path, { cookie, method = 'GET', body, headers = {} } = {}, expected = 200) {
    const res = await originalFetch(base + '/api' + path, { method, headers: { origin: process.env.FRONTEND_URL,
      ...(cookie ? { cookie: cookie.cookie, 'x-csrf-token': cookie.csrf } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await res.json(); assert.equal(res.status, expected, JSON.stringify(result));
    return { res, data: result.data, result };
  }
  async function login(user) {
    const { res, data } = await request('/auth/login', { method: 'POST', body: { email: user.email, password } });
    return { cookie: res.headers.get('set-cookie').split(';')[0], csrf: data.csrf_token };
  }
  const cookie = await login(ana), otra = await login(luz), jefe = await login(admin);
  const get = (ref, quien = cookie) => request('/agenda/compras/' + ref, { cookie: quien });
  const crear = async (quien = cookie) => {
    const ref = randomUUID();
    return (await request('/agenda/compras', { cookie: quien, method: 'POST', body: { referencia: ref } })).data;
  };
  const pagar = (ref, quien = cookie, expected = 200) => request('/agenda/compras/' + ref + '/mercadopago', { cookie: quien, method: 'POST', body: {} }, expected);
  async function notificar(ref, changes = {}, expected = 200) {
    const compra = await m.compras.findOne({ where: { referencia: ref } }), pid = String(++sequence), oid = String(++sequence);
    const approved = new Date(fecha(compra.creado_en).getTime() + 1).toISOString();
    const payment = { id: Number(pid), collector_id: 123456, live_mode: false, external_reference: ref,
      status: 'approved', status_detail: 'accredited', transaction_amount: Number(compra.total), transaction_amount_refunded: 0,
      currency_id: 'ARS', date_approved: approved, date_last_updated: approved,
      order: { id: Number(oid), type: 'mercadopago' }, ...changes };
    payments.set(pid, payment);
    orders.set(oid, { id: Number(oid), collector: { id: 123456 }, external_reference: ref,
      preference_id: compra.mp_preferencia_id, payments: [{ id: Number(pid) }] });
    const notify = async (wanted = expected) => {
      const requestId = randomUUID(), ts = '1704908010';
      const signature = createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(`id:${pid};request-id:${requestId};ts:${ts};`).digest('hex');
      const res = await originalFetch(base + '/api/mercadopago/webhook?data.id=' + pid + '&type=payment', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` },
        body: JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: pid }, status: 'approved' }) });
      assert.equal(res.status, wanted, JSON.stringify(await res.json()));
    };
    await notify(); return { notify, payment };
  }
  const acceso = () => m.agenda_accesos.findOne({ where: { usuario_id: ana.id } });
  let primera, rechazo;
  await t.test('Cuenta obligatoria, CSRF y origen; IDs, email y precios libres no permiten comprar', async () => {
    await request('/agenda/venta', {}, 401);
    await request('/agenda/compras', { cookie, method: 'POST', body: { referencia: randomUUID() }, headers: { 'x-csrf-token': 'falso' } }, 403);
    await request('/agenda/compras', { cookie, method: 'POST', body: { referencia: randomUUID(), total: '1', usuario_id: luz.id } }, 422);
    await request('/agenda/compras', { cookie, method: 'POST', body: { referencia: randomUUID() } }, 409);
    await m.agenda_venta_configuracion.update({ precio: '15000.00', venta_habilitada: 1, acceso_duracion_cantidad: 30, acceso_duracion_unidad: 'DIAS' }, { where: { id: '1' } });
    assert.equal(await m.agenda_accesos.count(), 0); assert.equal(posts, 0);
  });
  await t.test('Cuenta y condiciones congeladas; recarga, doble clic y otra referencia no duplican', async () => {
    primera = await crear();
    assert.equal(primera.total, '15000.00'); assert.equal(primera.acceso_duracion_cantidad, 30);
    await request('/agenda/compras', { cookie, method: 'POST', body: { referencia: primera.referencia } });
    await request('/agenda/compras', { cookie, method: 'POST', body: { referencia: randomUUID() } }, 409);
    await request('/agenda/compras/' + primera.referencia, { cookie: otra }, 404);
    await pagar(primera.referencia, otra, 404);
    await m.agenda_venta_configuracion.update({ precio: '20000.00', acceso_duracion_cantidad: 60 }, { where: { id: '1' } });
    assert.equal((await get(primera.referencia)).data.total, '15000.00');
    await pagar(primera.referencia); await pagar(primera.referencia); assert.equal(posts, 1);
    const pref = preferences.get(primera.referencia);
    assert.equal(pref.items[0].unit_price, 15000); assert.match(pref.items[0].id, /^agenda-/);
    assert.equal(new URL(pref.back_urls.success).pathname, '/mi-agenda/compras/' + primera.referencia);
    assert.equal(pref.expiration_date_to, primera.vence_en); assert.equal(await acceso(), null);
  });
  await t.test('Webhook aprobado entrega sin navegador; replay no suma días ni duplica comprobante', async () => {
    const pago = await notificar(primera.referencia); const row = await acceso();
    assert.ok(row); assert.equal(row.estado, 'ACTIVO');
    assert.equal(fecha(row.vence_en) - fecha(row.inicio_en), 30 * 86400000);
    const fin = row.vence_en; await pago.notify(); assert.equal((await acceso()).vence_en, fin);
    assert.equal((await get(primera.referencia)).data.entregada, true);
    const compra = await m.compras.findOne({ where: { referencia: primera.referencia } });
    assert.equal(await m.auditoria_eventos.count({ where: { entidad: 'compras', entidad_id: compra.id, accion: 'COMPRA_ENTREGADA' } }), 1);
    assert.equal(await m.compra_items.count(), 0); assert.equal(await m.curso_accesos.count(), 0);
  });
  await t.test('Renovar suma al vencimiento y conserva exactamente tareas, notas y pilares', async () => {
    const row = await acceso(), anterior = fecha(row.vence_en);
    const dia = await m.agenda_dias.create({ usuario_id: ana.id, fecha: '2026-10-24', prioridad_1_texto: 'Mi pilar', prioridad_1_cumplida: 1 });
    const tarea = await m.agenda_tareas.create({ usuario_id: ana.id, dia_id: dia.id, texto: 'Mi tarea', categoria: 'ESTRATEGICO' });
    const nota = await m.agenda_notas.create({ usuario_id: ana.id, dia_id: dia.id, texto: 'Mi nota' });
    const before = JSON.stringify([(await dia.reload()).toJSON(), (await tarea.reload()).toJSON(), (await nota.reload()).toJSON()]);
    const compra = await crear(); await pagar(compra.referencia); await notificar(compra.referencia);
    assert.equal(fecha((await acceso()).vence_en) - anterior, 60 * 86400000);
    assert.equal(JSON.stringify([(await dia.reload()).toJSON(), (await tarea.reload()).toJSON(), (await nota.reload()).toJSON()]), before);
  });
  await t.test('Rechazo y devolución manipulada no habilitan; otro importe queda en revisión', async () => {
    rechazo = await crear(otra); await pagar(rechazo.referencia, otra);
    await notificar(rechazo.referencia, { status: 'rejected', status_detail: 'cc_rejected_other_reason', date_approved: null });
    assert.equal((await get(rechazo.referencia, otra)).data.pago_rechazado, true);
    assert.equal(await m.agenda_accesos.count({ where: { usuario_id: luz.id } }), 0);
    await request('/agenda/compras/' + rechazo.referencia + '/aplicar', { cookie: otra, method: 'POST', body: { estado: 'PAGADA' } }, 422);
    await notificar(rechazo.referencia, { transaction_amount: 1 });
    assert.equal((await get(rechazo.referencia, otra)).data.pago_en_revision, true);
    assert.equal(await m.agenda_accesos.count({ where: { usuario_id: luz.id } }), 0);
  });
  await t.test('Revocar antes de pagar bloquea; revocar después del intento exige revisión y conserva datos', async () => {
    const compra = await crear();
    await (await acceso()).update({ estado: 'REVOCADO' }); await pagar(compra.referencia, cookie, 409);
    await (await acceso()).update({ estado: 'ACTIVO' }); await pagar(compra.referencia);
    await (await acceso()).update({ estado: 'SUSPENDIDO' }); await notificar(compra.referencia);
    assert.equal((await get(compra.referencia)).data.entregada, false); assert.equal((await acceso()).estado, 'SUSPENDIDO');
    await (await acceso()).update({ estado: 'ACTIVO' });
    await request('/agenda/compras/' + compra.referencia + '/aplicar', { cookie, method: 'POST', body: {} });
    assert.equal((await get(compra.referencia)).data.entregada, true);
  });
  await t.test('Respuesta perdida recupera preferencia por GET y no hace otro POST', async () => {
    const compra = await crear(); perderRespuesta = true; await pagar(compra.referencia, cookie, 503); perderRespuesta = false;
    const before = posts; await pagar(compra.referencia, cookie, 409);
    const result = await reconciliarCompra(compra.referencia); assert.equal(result.preferencia_recuperada, true);
    await pagar(compra.referencia); assert.equal(posts, before);
    await notificar(compra.referencia);
  });
  await t.test('Error al auditar entrega conserva pago y replay recupera una sola habilitación', async () => {
    const compra = await crear(); await pagar(compra.referencia);
    const original = m.auditoria_eventos.create;
    const fin = (await acceso()).vence_en;
    m.auditoria_eventos.create = async (data, options) => { if (data.accion === 'COMPRA_ENTREGADA') throw new Error('Fallo controlado'); return original.call(m.auditoria_eventos, data, options); };
    let pago;
    try { pago = await notificar(compra.referencia, {}, 500); } finally { m.auditoria_eventos.create = original; }
    assert.equal((await acceso()).vence_en, fin);
    assert.equal((await get(compra.referencia)).data.estado, 'PAGADA');
    await pago.notify(200); assert.equal((await get(compra.referencia)).data.entregada, true);
  });
  await t.test('Acceso vencido comienza ahora y cierra cronómetro antiguo en el vencimiento anterior', async () => {
    const now = Date.now(), inicio = new Date(now - 3 * 86400000), fin = new Date(now - 86400000);
    await (await acceso()).update({ inicio_en: inicio, vence_en: fin });
    const dia = await m.agenda_dias.findOne({ where: { usuario_id: ana.id } });
    const tramo = await m.agenda_tiempo_registros.create({ usuario_id: ana.id, dia_id: dia.id,
      categoria: 'OPERATIVO', inicio_en: new Date(fin.getTime() - 20000), en_curso: 1 });
    const compra = await crear(); await pagar(compra.referencia); await notificar(compra.referencia);
    const actual = await acceso(); assert(fecha(actual.inicio_en).getTime() >= now);
    await tramo.reload(); assert.equal(tramo.duracion_segundos, 20); assert.equal(tramo.en_curso, null);
  });
  await t.test('Sin vencimiento y pausa de venta conservan acceso; admin ve Agenda en Compras', async () => {
    await m.agenda_venta_configuracion.update({ acceso_duracion_cantidad: null, acceso_duracion_unidad: 'SIN_VENCIMIENTO' }, { where: { id: '1' } });
    const compra = await crear(); await pagar(compra.referencia); await notificar(compra.referencia);
    assert.equal((await acceso()).vence_en, null);
    await request('/agenda/compras', { cookie, method: 'POST', body: { referencia: randomUUID() } }, 409);
    await m.agenda_venta_configuracion.update({ venta_habilitada: 0 }, { where: { id: '1' } });
    assert.equal((await request('/agenda/venta', { cookie })).data.disponible, false);
    const list = await request('/admin/compras', { cookie: jefe });
    assert(list.data.some(row => row.items.some(item => item.tipo === 'AGENDA' && item.titulo === 'Mi agenda')));
    const row = await m.compras.findOne({ where: { referencia: compra.referencia } });
    const detail = await request('/admin/compras/' + row.id, { cookie: jefe });
    assert.equal(detail.data.estado_entrega, 'ENTREGADA'); assert.equal(detail.data.items[0].tipo, 'AGENDA');
  });
  await t.test('Migración y fixture conservan restricciones; ningún CHECK usa la columna autoincremental', async () => {
    const sql = await readFile(new URL('../docs/sql/AGENDA_ETAPA6.sql', import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /CHECK\s*\(\s*id\s*[=<>]/);
    for (const check of ['precio','moneda','version','duracion','entrega']) assert(sql.includes('ck_agenda_compra_' + check));
    await assert.rejects(() => m.agenda_compras.update({ acceso_duracion_unidad: 'SIN_VENCIMIENTO', acceso_duracion_cantidad: 1 }, { where: { id: '1' } }));
  });
});
