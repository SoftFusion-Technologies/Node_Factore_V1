import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { conectarPrueba } from './adapter-crm.js';
import { corteRetencion, limpiarCredenciales } from '../src/Services/Sistema/limpiezaCredenciales.service.js';
import { iniciarLimpiezaCredenciales, INTERVALO_LIMPIEZA_MS } from '../src/Jobs/JB_LimpiarCredenciales.js';
const ahora = '2026-10-05T17:00:00.000Z', corte = '2026-09-05T17:00:00.000Z';
const antes = new Date(Date.parse(corte) - 1), despues = new Date(Date.parse(corte) + 1), reciente = new Date('2026-10-04T17:00:00.000Z');
const futuro = new Date('2026-10-07T17:00:00.000Z'), creado = new Date('2026-08-01T17:00:00.000Z');
const hash = () => randomBytes(32).toString('hex');

test('Retención: reloj UTC explícito, límite exacto y rechazo de fechas locales', () => {
  assert.equal(corteRetencion('2026-10-05 17:00:00.000').toISOString(), corte);
  assert.equal(corteRetencion(new Date(ahora)).toISOString(), corte);
  for (const value of [undefined, null, '', 0, '2026-10-05T17:00:00', 'no-es-fecha', new Date(NaN)]) assert.throws(() => corteRetencion(value));
});

test('Limpieza: SQL Sequelize sobre SQLite aislado; consulta, retención y lotes', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'contenido.sqlite.sql' });
  const query = db.query.bind(db);
  db.query = (sql, options) => sql === 'SELECT UTC_TIMESTAMP(3) AS ahora' ? Promise.resolve([{ ahora }]) : query(sql, options);
  t.after(async () => { db.query = query; await adapter.close(); });
  const usuario = await modelos.usuarios.create({ nombre: 'Cuenta para limpieza', email: 'limpieza@example.invalid', rol: 'ADMIN', estado: 'ACTIVO' });
  const sesiones = [], tokens = [];
  async function sesion(data) { const row = await modelos.usuarios_sesiones.create({ usuario_id: usuario.id, token_hash: hash(), creado_en: creado, vence_en: futuro, ...data }); sesiones.push(row); return row; }
  async function token(data) { const row = await modelos.usuarios_tokens.create({ usuario_id: usuario.id, tipo: 'ACTIVACION', token_hash: hash(), creado_en: creado, vence_en: futuro, ...data }); tokens.push(row); return row; }
  let preview;
  await t.test('Vista previa no escribe ni expone identificadores, IP o hashes', async () => {
    // 3 sesiones elegibles: vencimiento antiguo, revocación antigua, límite exacto.
    await sesion({ vence_en: antes }); await sesion({ revocada_en: antes }); await sesion({ vence_en: new Date(corte) });
    // 4 conservadas: vigentes aunque antiguas, vencimiento/revocación recientes y +1ms.
    await sesion({}); await sesion({ vence_en: reciente }); await sesion({ revocada_en: reciente }); await sesion({ vence_en: despues });
    // 4 tokens elegibles por vencimiento, uso, revocación o límite exacto.
    await token({ vence_en: antes }); await token({ usado_en: antes }); await token({ revocado_en: antes }); await token({ usado_en: new Date(corte) });
    // 4 conservados: vigente, usado hace un día, revocado hace un día, +1ms.
    await token({}); await token({ usado_en: reciente }); await token({ revocado_en: reciente }); await token({ vence_en: despues });
    const start = adapter.statements.length;
    preview = await limpiarCredenciales();
    assert.equal(preview.modo, 'CONSULTA'); assert.equal(preview.corte_utc, corte);
    assert.deepEqual(preview.candidatos, { sesiones: 3, tokens: 4 }); assert.deepEqual(preview.eliminados, { sesiones: 0, tokens: 0 });
    assert.equal(await modelos.usuarios_sesiones.count(), 7); assert.equal(await modelos.usuarios_tokens.count(), 8);
    assert.ok(adapter.statements.slice(start).every(sql => /^SELECT/i.test(sql)));
    assert.ok(!/token_hash|usuario_id|user_agent|password|example.invalid/.test(JSON.stringify(preview)));
  });
  await t.test('Borrado acotado comunica pendientes y conserva todos los vigentes/recientes', async () => {
    const first = await limpiarCredenciales({ aplicar: true, lote: 2, maxLotes: 1 });
    assert.deepEqual(first.eliminados, { sesiones: 2, tokens: 2 }); assert.deepEqual(first.pendientes, { sesiones: 1, tokens: 2 });
    const second = await limpiarCredenciales({ aplicar: true, lote: 2 });
    assert.deepEqual(second.eliminados, { sesiones: 1, tokens: 2 }); assert.deepEqual(second.pendientes, { sesiones: 0, tokens: 0 });
    for (const row of sesiones.slice(3)) assert.ok(await modelos.usuarios_sesiones.findByPk(row.id));
    for (const row of tokens.slice(4)) assert.ok(await modelos.usuarios_tokens.findByPk(row.id));
    assert.equal(await modelos.usuarios.count(), 1);
  });
  await t.test('Repetir es idempotente; no queda trabajo ni se borra por fecha de creación', async () => {
    const result = await limpiarCredenciales({ aplicar: true }); assert.deepEqual(result.eliminados, { sesiones: 0, tokens: 0 });
    assert.equal(await modelos.usuarios_sesiones.count(), 4); assert.equal(await modelos.usuarios_tokens.count(), 4);
  });
  await t.test('Revalidar al borrar conserva una fila modificada después de seleccionarla', async () => {
    const row = await sesion({ vence_en: antes }), original = modelos.usuarios_sesiones.findAll;
    let changed = false;
    modelos.usuarios_sesiones.findAll = async function(options) {
      const rows = await original.call(this, options);
      if (!changed && rows.some(candidate => String(candidate.id) === String(row.id))) { changed = true; await row.update({ vence_en: futuro }); }
      return rows;
    };
    try {
      const result = await limpiarCredenciales({ aplicar: true }); assert.equal(result.eliminados.sesiones, 0); assert.ok(await modelos.usuarios_sesiones.findByPk(row.id));
    } finally { modelos.usuarios_sesiones.findAll = original; }
    assert.ok(adapter.statements.filter(sql => /^DELETE/i.test(sql)).every(sql => /id.*IN/i.test(sql) && /vence_en/.test(sql)));
  });
  await t.test('Una señal de cierre evita nuevas eliminaciones; parámetros inválidos se rechazan', async () => {
    await token({ vence_en: antes }); const controller = new AbortController(); controller.abort();
    const result = await limpiarCredenciales({ aplicar: true, signal: controller.signal }); assert.equal(result.interrumpido, true); assert.equal(result.eliminados.tokens, 0); assert.equal(result.pendientes.tokens, 1);
    for (const options of [{ aplicar: 'si' }, { lote: 0 }, { lote: 1001 }, { maxLotes: 0 }]) await assert.rejects(limpiarCredenciales(options));
  });
  await t.test('Fallo de SQL queda visible y puede reintentarse sin afectar las cuentas', async () => {
    const original = modelos.usuarios_tokens.destroy;
    modelos.usuarios_tokens.destroy = async () => { throw Object.assign(new Error('detalle de SQL privado'), { code: 'ER_LOCK_WAIT_TIMEOUT' }); };
    try { await assert.rejects(limpiarCredenciales({ aplicar: true }), error => error.code === 'ER_LOCK_WAIT_TIMEOUT'); }
    finally { modelos.usuarios_tokens.destroy = original; }
    assert.equal((await limpiarCredenciales({ aplicar: true })).eliminados.tokens, 1);
  });
  await t.test('Retención desde primer evento inválido: revocación reciente no prolonga expiración antigua', async () => {
    await sesion({ vence_en: antes, revocada_en: reciente }); await token({ vence_en: futuro, usado_en: antes, revocado_en: reciente });
    const result = await limpiarCredenciales({ aplicar: true }); assert.deepEqual(result.eliminados, { sesiones: 1, tokens: 1 });
    assert.equal(await modelos.usuarios_sesiones.count({ where: { vence_en: { [Op.gt]: new Date(corte) } } }), 5);
  });
});

function scheduler(limpiar, registrar) {
  const timers = [], cancelled = [], logs = [];
  const job = iniciarLimpiezaCredenciales({ limpiar, registrar: registrar || (value => logs.push(value)),
    programarTimer: (callback, delay) => { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer; }, cancelarTimer: timer => cancelled.push(timer) });
  return { job, timers, cancelled, logs };
}
test('Job: arranque, una ejecución a la vez, frecuencia diaria y detener sin reprogramar', async () => {
  let resolve, signal;
  const state = scheduler(options => { assert.equal(options.aplicar, true); signal = options.signal; return new Promise(done => { resolve = done; }); });
  assert.equal(state.timers[0].delay, 0); const running = state.timers[0].callback(); assert.equal(state.timers.length, 1);
  resolve({ eliminados: { sesiones: 1, tokens: 1 } }); await running;
  assert.equal(state.timers[1].delay, INTERVALO_LIMPIEZA_MS); assert.equal(state.logs[0].event, 'LIMPIEZA_CREDENCIALES');
  const second = state.timers[1].callback(); let stopped = false; const stop = state.job.detener().then(() => { stopped = true; });
  assert.equal(signal.aborted, true); await Promise.resolve(); assert.equal(stopped, false);
  resolve({ interrumpido: true }); await second; await stop; assert.equal(state.timers.length, 2);
});
test('Job: cancelar timer antes de comenzar no ejecuta una limpieza', async () => {
  let calls = 0; const state = scheduler(async () => { calls++; }); await state.job.detener();
  assert.equal(state.cancelled.length, 1); await state.timers[0].callback(); assert.equal(calls, 0);
});
test('Job: fallo no cae como rechazo sin manejar y loguea solo código', async () => {
  const state = scheduler(async () => { throw Object.assign(new Error('SQL con secretos'), { code: 'ERROR_PRUEBA' }); });
  await state.timers[0].callback(); assert.deepEqual(state.logs, [{ event: 'LIMPIEZA_CREDENCIALES_ERROR', code: 'ERROR_PRUEBA' }]);
  assert.equal(state.timers[1].delay, INTERVALO_LIMPIEZA_MS); await state.job.detener();
});

test('Cierre real: deja de escuchar, espera mantenimiento y recién entonces cierra DB', async () => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { cerrarServidor } = await import('../src/Services/Sistema/servidor.service.js');
  const server = createServer((_req, res) => res.end('ok'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const events = [], original = db.close;
  let release; const maintenance = new Promise(resolve => { release = resolve; });
  db.close = async () => { events.push('DB_CERRADA'); };
  try {
    const closing = cerrarServidor(server, { antesCerrarDB: async () => { events.push('ESPERANDO'); await maintenance; events.push('MANTENIMIENTO_TERMINADO'); } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(server.listening, false); assert.deepEqual(events, ['ESPERANDO']);
    release(); await closing; assert.deepEqual(events, ['ESPERANDO', 'MANTENIMIENTO_TERMINADO', 'DB_CERRADA']);
  } finally { release(); db.close = original; server.closeAllConnections(); }
});
test('CLI rechaza argumentos libres antes de conectar y no muestra datos privados', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['Scripts/limpiar-credenciales.js', '--opcion-no-permitida'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.deepEqual(JSON.parse(result.stderr), { error: 'ARGUMENTOS_INVALIDOS' });
});
