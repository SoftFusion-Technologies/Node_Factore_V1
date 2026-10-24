/* Benjamin Orellana - 20/10/2026 - Controladores de Agenda: HTTP/cookies reales y SQLite aislado. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import db from '../src/DataBase/db.js';
import { modelos as m } from '../src/Models/index.js';
import * as Agenda from '../src/Controllers/Agenda/CTS_Agenda.js';
import * as Accesos from '../src/Controllers/Agenda/CTS_TB_AgendaAccesos.js';
import * as Tareas from '../src/Controllers/Agenda/CTS_TB_AgendaTareas.js';
import * as Notas from '../src/Controllers/Agenda/CTS_TB_AgendaNotas.js';
import * as Tiempos from '../src/Controllers/Agenda/CTS_TB_AgendaTiempoRegistros.js';
import { hashToken, tokenAleatorio, tokenCsrf } from '../src/utils/password.utils.js';
import { conectarPrueba } from './adapter-crm.js';

test('Agenda: controladores aislados de las futuras rutas, sesiones reales y propiedad', async t => {
  const adapter = await conectarPrueba(db, { extras: ['agenda.sqlite.sql'] });
  const originales = Object.fromEntries(['NODE_ENV', 'FRONTEND_URL', 'ALLOWED_ORIGINS', 'COOKIE_SECURE', 'COOKIE_SAMESITE'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: 'test', FRONTEND_URL: 'http://127.0.0.1:5173',
    ALLOWED_ORIGINS: 'http://127.0.0.1:5173', COOKIE_SECURE: 'false', COOKIE_SAMESITE: 'Lax' });
  let reloj = new Date('2026-10-21T01:30:00.000Z'); // 20/10, 22:30 en Argentina.
  const queryOriginal = db.query;
  db.query = function (sql, options) {
    if (sql === 'SELECT UTC_TIMESTAMP(3) AS ahora_en') return Promise.resolve([{ ahora_en: reloj.toISOString() }]);
    return queryOriginal.call(this, sql, options);
  };
  async function cuenta(nombre, rol = 'ALUMNO') {
    const cliente = rol === 'ALUMNO' ? await m.crm_clientes.create({ nombre }) : null;
    const user = await m.usuarios.create({ nombre, email: nombre.toLowerCase() + '@example.invalid', rol,
      estado: 'ACTIVO', cambiar_password: 0, cliente_id: cliente?.id ?? null });
    const token = tokenAleatorio();
    const sesion = await m.usuarios_sesiones.create({ usuario_id: user.id, token_hash: hashToken(token), vence_en: '2060-01-01T00:00:00Z' });
    return { user, cliente, sesion, cookie: 'factore_sid=' + token, csrf: tokenCsrf(token) };
  }
  const admin = await cuenta('Juan', 'ADMIN'), ana = await cuenta('Ana'), luz = await cuenta('Luz');
  // Router EXCLUSIVO de pruebas. No se agrega ningún endpoint a la aplicación real.
  const rutas = [
    [/^\/estado$/, [], () => Agenda.OBRS_EstadoMiAgenda_CTS],
    [/^\/mes$/, [], () => Agenda.OBRS_MiAgendaMes_CTS],
    [/^\/preferencias$/, [], () => Agenda.UR_MisPreferenciasAgenda_CTS],
    [/^\/admin\/accesos\/([^/]+)$/, ['usuario_id'], method => method === 'GET' ? Accesos.OBRS_AgendaAccesoUsuario_CTS : Accesos.UR_AgendaAccesoUsuario_CTS],
    [/^\/dias\/([^/]+)$/, ['fecha'], method => method === 'GET' ? Agenda.OBRS_MiAgendaDia_CTS : Agenda.UR_MiAgendaDia_CTS],
    [/^\/dias\/([^/]+)\/tareas$/, ['fecha'], () => Tareas.CR_AgendaTarea_CTS],
    [/^\/tareas\/([^/]+)$/, ['id'], method => method === 'DELETE' ? Tareas.ER_AgendaTarea_CTS : Tareas.UR_AgendaTarea_CTS],
    [/^\/tareas\/([^/]+)\/recordar$/, ['id'], () => Tareas.RECORDAR_AgendaTarea_CTS],
    [/^\/dias\/([^/]+)\/notas$/, ['fecha'], () => Notas.CR_AgendaNota_CTS],
    [/^\/dias\/([^/]+)\/notas\/orden$/, ['fecha'], () => Notas.ORDENAR_AgendaNotas_CTS],
    [/^\/notas\/([^/]+)$/, ['id'], method => method === 'DELETE' ? Notas.ER_AgendaNota_CTS : Notas.UR_AgendaNota_CTS],
    [/^\/tiempos$/, [], () => Tiempos.INICIAR_AgendaTiempo_CTS],
    [/^\/tiempos\/([^/]+)\/detener$/, ['id'], () => Tiempos.DETENER_AgendaTiempo_CTS],
    [/^\/tiempos\/([^/]+)$/, ['id'], () => Tiempos.ER_AgendaTiempo_CTS]
  ];
  const server = createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; };
    try {
      const url = new URL(req.url, 'http://test'); req.query = Object.fromEntries(url.searchParams);
      if (!['GET', 'HEAD'].includes(req.method)) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      }
      for (const [pattern, names, handler] of rutas) {
        const match = pattern.exec(url.pathname);
        if (!match) continue;
        req.params = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
        return handler(req.method)(req, res);
      }
      res.status(404).json({ error: { code: 'RUTA_DE_PRUEBA_INEXISTENTE' } });
    } catch (error) { res.status(500).json({ error: { code: error.name } }); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    m.auditoria_eventos.removeHook('beforeCreate', 'agenda-prueba');
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    db.query = queryOriginal;
    for (const [key, value] of Object.entries(originales)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await adapter.close();
  });
  async function enviar(ruta, { usuario = ana, body, method = body === undefined ? 'GET' : 'PATCH', headers = {} } = {}, status = 200) {
    const res = await fetch(base + ruta, { method, headers: { origin: 'http://127.0.0.1:5173',
      ...(usuario ? { cookie: usuario.cookie, 'x-csrf-token': usuario.csrf } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json();
    assert.equal(res.status, status, JSON.stringify(data));
    assert.match(res.headers.get('cache-control'), /no-store/);
    return data.data;
  }
  async function permiso(usuario, cambios = {}) {
    const actual = await enviar('/admin/accesos/' + usuario.user.id, { usuario: admin });
    return enviar('/admin/accesos/' + usuario.user.id, { usuario: admin, body: { version: actual.version,
      estado: 'ACTIVO', motivo: 'Habilitación individual de pruebas', ...cambios } });
  }
  const dia = '/dias/2026-10-20';
  let tarea1, tarea2, tarea3, nota1, nota2, diaDatos;

  await t.test('Cookie real obligatoria; rol ADMIN no desbloquea Agenda y consultar estado no crea registros', async () => {
    await enviar('/estado', { usuario: null, headers: { 'x-user-id': ana.user.id } }, 401);
    await enviar(dia, { usuario: null }, 401);
    for (const usuario of [ana, luz, admin]) {
      assert.equal((await enviar('/estado', { usuario })).estado_temporal, 'SIN_ACCESO');
      await enviar(dia, { usuario }, 403);
    }
    assert.equal(await m.agenda_accesos.count(), 0); assert.equal(await m.agenda_dias.count(), 0);
  });
  await t.test('Permiso manual: administrador, CSRF, origen, JSON, versión y cuenta exacta', async () => {
    const path = '/admin/accesos/' + ana.user.id;
    const body = { version: 0, estado: 'ACTIVO', motivo: 'Prueba' };
    await enviar(path, { body }, 403);
    await enviar(path, { usuario: admin, body, headers: { 'x-csrf-token': 'ajeno' } }, 403);
    await enviar(path, { usuario: admin, body, headers: { origin: 'https://ajeno.invalid' } }, 403);
    await enviar(path, { usuario: admin, body, headers: { 'content-type': 'text/plain' } }, 415);
    const reqSinOrigen = { method: 'PATCH', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf,
      'content-type': 'application/json' }, params: { usuario_id: ana.user.id }, query: {}, body };
    const resultado = { setHeader() {}, status(code) { this.code = code; return this; }, json() {} };
    await Accesos.UR_AgendaAccesoUsuario_CTS(reqSinOrigen, resultado); assert.equal(resultado.code, 403);
    await enviar(path, { usuario: admin, body: { ...body, usuario_id: luz.user.id } }, 422);
    await permiso(ana); await permiso(luz);
    assert.equal((await enviar('/estado')).habilitada, true);
    assert.equal((await enviar('/estado', { usuario: admin })).habilitada, false);
  });
  await t.test('Leer un día vacío no escribe; fecha argentina, mes bisiesto y filtros estrictos', async () => {
    diaDatos = await enviar(dia); assert.equal(diaDatos.dia.version, 0); assert.equal(diaDatos.hoy, '2026-10-20');
    assert.equal(await m.agenda_dias.count(), 0); assert.equal(await m.agenda_preferencias.count(), 0);
    assert.equal((await enviar('/mes?mes=2028-02')).dias.length, 29);
    await enviar('/mes?mes=2026-13', {}, 422); await enviar('/dias/2026-02-30', {}, 422);
    await enviar(dia + '?usuario_id=' + luz.user.id, {}, 422);
  });
  await t.test('Tres pilares, edición parcial y conflicto de versión sin pisar cambios', async () => {
    diaDatos = await enviar(dia, { body: { version: 0, frase: 'Dato privado de Ana', prioridad_1_texto: 'Planificar', prioridad_1_cumplida: 1 } });
    assert.equal(diaDatos.version, 1);
    await enviar(dia, { body: { version: 0, frase: 'No debe guardarse' } }, 409);
    await enviar(dia, { body: { version: 1, prioridad_1_texto: '' } }, 422);
    await enviar(dia, { body: { version: 1, prioridad_2_cumplida: 1 } }, 422);
    await enviar(dia, { body: { version: 1, frase: '\0' } }, 422);
    await enviar(dia, { body: { version: 1, frase: 'a'.repeat(501) } }, 422);
    await enviar(dia, { body: { version: 1, usuario_id: luz.user.id } }, 422);
    diaDatos = await enviar(dia, { body: { version: 1, frase: 'Frase actualizada' } });
    assert.equal(diaDatos.prioridad_1_cumplida, 1); assert.equal(diaDatos.version, 2);
  });
  await t.test('Tareas y progreso ponderado; notas no suman puntos', async () => {
    tarea1 = await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Propuesta privada', categoria: 'COMERCIAL', prioridad: 1, completada: 1 } }, 201);
    tarea2 = await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Ordenar', categoria: 'OPERATIVO', prioridad: 2 } }, 201);
    tarea3 = await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Caminar', categoria: 'PERSONAL', prioridad: 3 } }, 201);
    nota1 = await enviar(dia + '/notas', { method: 'POST', body: { texto: 'Nota privada\nCon otra línea ✓' } }, 201);
    nota2 = await enviar(dia + '/notas', { method: 'POST', body: { texto: 'Segunda nota' } }, 201);
    const datos = await enviar(dia); assert.equal(datos.progreso.puntos_totales, 13);
    assert.equal(datos.progreso.puntos_completados, 9); assert.equal(datos.progreso.porcentaje, 69);
    await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Sin hora', categoria: 'COMERCIAL', recordatorio: 1 } }, 422);
    await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Hora mala', categoria: 'COMERCIAL', hora: '25:00' } }, 422);
    await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Con ID libre', categoria: 'COMERCIAL', id: '90' } }, 422);
  });
  await t.test('IDs conocidos de otra cuenta no permiten editar, borrar, recordar ni ordenar', async () => {
    for (const [ruta, method, body] of [
      ['/tareas/' + tarea1.id, 'PATCH', { version: tarea1.version, texto: 'Ataque' }],
      ['/tareas/' + tarea1.id, 'DELETE', { version: tarea1.version }],
      ['/tareas/' + tarea1.id + '/recordar', 'POST', { version: tarea1.version }],
      ['/notas/' + nota1.id, 'PATCH', { version: nota1.version, texto: 'Ataque' }]
    ]) await enviar(ruta, { usuario: luz, method, body }, 404);
    await enviar(dia + '/notas/orden', { usuario: luz, body: { notas: [{ id: nota1.id, version: nota1.version }] } }, 409);
    const propia = JSON.stringify(await enviar(dia, { usuario: luz }));
    assert.ok(!propia.includes('privada')); assert.ok(!propia.includes('Propuesta'));
  });
  await t.test('Mover tarea completada conserva compleción; edición vieja no cambia categoría ni fecha', async () => {
    const fechaCompletada = tarea1.completada_en;
    tarea1 = await enviar('/tareas/' + tarea1.id, { body: { version: tarea1.version, fecha: '2026-10-21', categoria: 'ESTRATEGICO' } });
    assert.equal(tarea1.completada_en, fechaCompletada); assert.equal(tarea1.completada, 1);
    await enviar('/tareas/' + tarea1.id, { body: { version: 1, texto: 'Vieja' } }, 409);
    assert.equal((await enviar('/dias/2026-10-21')).tareas[0].categoria, 'ESTRATEGICO');
  });
  await t.test('Notas: orden completo con versiones; faltar una nota o repetir IDs no modifica nada', async () => {
    await enviar(dia + '/notas/orden', { body: { notas: [{ id: nota2.id, version: 1 }] } }, 409);
    await enviar(dia + '/notas/orden', { body: { notas: [{ id: nota2.id, version: 1 }, { id: nota2.id, version: 1 }] } }, 422);
    const ordenadas = await enviar(dia + '/notas/orden', { body: { notas: [{ id: nota2.id, version: 1 }, { id: nota1.id, version: 1 }] } });
    assert.equal(ordenadas[0].id, nota2.id);
    await enviar('/notas/' + nota1.id, { body: { version: 1, texto: 'Edición vieja' } }, 409);
    nota1 = ordenadas[1]; nota2 = ordenadas[0];
    nota1 = await enviar('/notas/' + nota1.id, { body: { version: nota1.version, cumplida: true } });
    assert.equal(nota1.texto, 'Nota privada\nCon otra línea ✓');
    assert.equal((await enviar(dia)).progreso.puntos_totales, 8);
    const pref = await enviar('/preferencias', { body: { version: 0, tema: 'OSCURO' } }); assert.equal(pref.tema, 'OSCURO');
    await enviar('/preferencias', { body: { version: 0, tema: 'CLARO' } }, 409);
  });
  await t.test('Recordatorios propios: hora argentina, una marca por tarea y reinicio al cambiar horario', async () => {
    let row = await enviar(dia + '/tareas', { method: 'POST', body: { texto: 'Recordatorio', categoria: 'OPERATIVO', recordatorio: 1, hora: '22:29' } }, 201);
    row = await enviar('/tareas/' + row.id + '/recordar', { method: 'POST', body: { version: row.version } });
    assert.ok(row.recordada_en);
    assert.equal(row.recordatorio_marcado, true);
    const repetida = await enviar('/tareas/' + row.id + '/recordar', { method: 'POST', body: { version: 1 } });
    assert.equal(repetida.recordada_en, row.recordada_en); assert.equal(repetida.version, row.version);
    assert.equal(repetida.recordatorio_marcado, false);
    row = await enviar('/tareas/' + row.id, { body: { version: row.version, hora: '22:31' } }); assert.equal(row.recordada_en, null);
    await enviar('/tareas/' + row.id + '/recordar', { method: 'POST', body: { version: row.version } }, 409);
  });
  let cronometros;
  await t.test('Cuatro cronómetros; iniciar repetido es estable, detener no duplica tiempo y eliminar exige pausa', async () => {
    cronometros = [];
    for (const categoria of ['OPERATIVO', 'COMERCIAL', 'ESTRATEGICO', 'PERSONAL']) {
      cronometros.push((await enviar('/tiempos', { method: 'POST', body: { categoria } })).registro);
    }
    const doble = await enviar('/tiempos', { method: 'POST', body: { categoria: 'OPERATIVO' } });
    assert.equal(doble.creado, false); assert.equal(doble.registro.id, cronometros[0].id);
    await enviar('/tiempos', { method: 'POST', body: { categoria: 'PERSONAL', duracion_segundos: 999 } }, 422);
    await enviar('/tiempos/' + cronometros[0].id, { method: 'DELETE', body: { version: 1 } }, 409);
    await enviar('/tiempos/' + cronometros[0].id + '/detener', { usuario: luz, method: 'POST', body: { version: 1 } }, 404);
    reloj = new Date(reloj.getTime() + 90000);
    const parado = await enviar('/tiempos/' + cronometros[0].id + '/detener', { method: 'POST', body: { version: 1 } });
    assert.equal(parado.duracion_segundos, 90);
    reloj = new Date(reloj.getTime() + 10000);
    const repetido = await enviar('/tiempos/' + cronometros[0].id + '/detener', { method: 'POST', body: { version: 1 } });
    assert.equal(repetido.fin_en, parado.fin_en); assert.equal(repetido.duracion_segundos, 90);
    await enviar('/tiempos/' + parado.id, { method: 'DELETE', body: { version: parado.version } });
    const datos = await enviar(dia); assert.equal(datos.cronometros_abiertos.length, 3); assert.equal(datos.tiempo_por_categoria.OPERATIVO, 0);
  });
  await t.test('Calendario y detalle completos después de 100 tareas; BIGINT conserva precisión', async () => {
    const rowDia = await m.agenda_dias.findOne({ where: { usuario_id: ana.user.id, fecha: '2026-10-21' } });
    await m.agenda_tareas.bulkCreate(Array.from({ length: 111 }, (_, i) => ({ usuario_id: ana.user.id, dia_id: rowDia.id,
      texto: 'Tarea ' + i, categoria: 'OPERATIVO', prioridad: 3 })));
    const grande = await m.agenda_tareas.create({ id: '9007199254740993', usuario_id: ana.user.id, dia_id: rowDia.id,
      texto: 'Identificador exacto', categoria: 'PERSONAL' });
    const datos = await enviar('/dias/2026-10-21'); assert.equal(datos.tareas.length, 113);
    assert.ok(datos.tareas.some(tarea => tarea.id === '9007199254740993'));
    const mes = await enviar('/mes?mes=2026-10'), fecha = mes.dias.find(d => d.fecha === '2026-10-21');
    assert.equal(fecha.tareas_totales, 113); assert.equal(fecha.vistas_previas.length, 2); assert.equal(fecha.tareas_adicionales, 111);
    await enviar('/tareas/' + grande.id, { body: { version: grande.version, prioridad: 2 } });
    await enviar('/tareas/90071992547409930x', { body: { version: 1, texto: 'Inválido' } }, 422);
  });
  await t.test('Fallo de auditoría revierte tarea y día nuevo; nunca devuelve textos internos o privados', async () => {
    m.auditoria_eventos.addHook('beforeCreate', 'agenda-prueba', () => { throw new Error('SECRETO_INTERNO_PRIVADO'); });
    const antes = await m.agenda_tareas.count();
    try {
      await enviar('/dias/2026-11-01/tareas', { method: 'POST', body: { texto: 'No guardar', categoria: 'PERSONAL' } }, 500);
    } finally { m.auditoria_eventos.removeHook('beforeCreate', 'agenda-prueba'); }
    assert.equal(await m.agenda_tareas.count(), antes);
    assert.equal(await m.agenda_dias.count({ where: { usuario_id: ana.user.id, fecha: '2026-11-01' } }), 0);
    const auditoria = JSON.stringify(await m.auditoria_eventos.findAll());
    assert.ok(!auditoria.includes('Nota privada')); assert.ok(!auditoria.includes('Propuesta privada'));
    assert.ok(!auditoria.includes('factore_sid')); assert.ok(!auditoria.includes('token_hash'));
  });
  await t.test('Vencer durante la escritura revierte; luego vencido bloquea y renovar conserva datos y limita tiempos', async () => {
    const acceso = await m.agenda_accesos.findOne({ where: { usuario_id: ana.user.id } });
    const vencimiento = new Date(reloj.getTime() + 1000);
    await acceso.update({ vence_en: vencimiento });
    m.auditoria_eventos.addHook('beforeCreate', 'agenda-prueba', () => { reloj = new Date(vencimiento.getTime()); });
    try { await enviar(dia, { body: { version: 2, frase: 'No guardar al vencer' } }, 403); }
    finally { m.auditoria_eventos.removeHook('beforeCreate', 'agenda-prueba'); }
    assert.equal((await enviar('/estado')).estado_temporal, 'VENCIDO');
    await enviar(dia, {}, 403);
    reloj = new Date(reloj.getTime() + 60000);
    await permiso(ana, { inicio_en: reloj.toISOString(), vence_en: null });
    const datos = await enviar(dia); assert.equal(datos.dia.frase, 'Frase actualizada');
    assert.equal(datos.notas.length, 2); assert.equal(datos.cronometros_abiertos.length, 0);
    for (const registro of datos.tiempos) assert.ok(new Date(registro.fin_en) <= vencimiento);
  });
  await t.test('Suspender y revocar bloquea inmediatamente; reactivar conserva tareas, notas y progreso', async () => {
    const antes = await enviar(dia);
    await permiso(ana, { estado: 'SUSPENDIDO' }); await enviar(dia, {}, 403);
    assert.equal((await enviar('/estado')).estado_temporal, 'SUSPENDIDO');
    await permiso(ana, { estado: 'REVOCADO' }); await enviar(dia, {}, 403);
    await permiso(ana);
    const despues = await enviar(dia); assert.deepEqual(despues.progreso, antes.progreso);
    assert.equal(despues.notas[0].id, antes.notas[0].id);
    const eventos = await m.auditoria_eventos.findAll({ where: { entidad: 'agenda_accesos' }, order: [['id', 'DESC']] });
    assert.equal(eventos[0].detalle.estado_anterior, 'REVOCADO');
  });
  await t.test('Sesión revocada antes de confirmar impide guardar y la cuenta bloqueada pierde acceso', async () => {
    const antes = await enviar(dia);
    m.auditoria_eventos.addHook('beforeCreate', 'agenda-prueba', async (_row, options) => {
      await m.usuarios_sesiones.update({ revocada_en: reloj }, { where: { id: ana.sesion.id }, transaction: options.transaction });
    });
    try { await enviar(dia, { body: { version: antes.dia.version, frase: 'No guardar sin sesión' } }, 401); }
    finally { m.auditoria_eventos.removeHook('beforeCreate', 'agenda-prueba'); }
    assert.equal((await enviar(dia)).dia.frase, antes.dia.frase);
    await ana.user.update({ estado: 'BLOQUEADO' }); await enviar(dia, {}, 401);
    await ana.user.update({ estado: 'ACTIVO' });
    await ana.cliente.update({ activo: 0 }); await enviar('/estado', {}, 401);
    await ana.cliente.update({ activo: 1 });
  });
  await t.test('Métodos y campos reservados no eluden el contrato; permiso programado todavía no abre la agenda', async () => {
    await enviar(dia, { method: 'POST', body: { version: 2, frase: 'Método incorrecto' } }, 405);
    await enviar('/tiempos', { method: 'POST', body: { categoria: 'PERSONAL', inicio_en: reloj.toISOString() } }, 422);
    await permiso(luz, { inicio_en: new Date(reloj.getTime() + 60000).toISOString() });
    assert.equal((await enviar('/estado', { usuario: luz })).estado_temporal, 'PROGRAMADO');
    await enviar(dia, { usuario: luz }, 403);
    const datos = JSON.stringify(await enviar(dia));
    assert.ok(!datos.includes('password_hash')); assert.ok(!datos.includes('token_hash'));
  });
});
