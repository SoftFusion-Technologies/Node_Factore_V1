/* Benjamin Orellana - 30/10/2026 - Incorporar cuatro rutas y tres controladores de diploma privado. */
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
import * as MP from '../src/Middlewares/mercadoPago.js';
/* Benjamin Orellana - 21/10/2026 - Contrato de Agenda con acceso personal y gestión ADMIN. */
/* Benjamin Orellana - 05/10/2026 - Contrato de rutas, cobertura y cadenas de permisos. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearApp } from '../app.js';
import routes from '../src/Routes/index.js';
import * as Security from '../src/Security/auth.js';
import * as Checkout from '../src/Middlewares/checkout.js';
import * as Http from '../src/Middlewares/http.js';
import db from '../src/DataBase/db.js';

function inventario(router) {
  return router.stack.flatMap(layer => layer.route
    ? Object.keys(layer.route.methods).map(method => ({ method: method.toUpperCase(), path: layer.route.path,
      handlers: layer.route.stack.map(item => item.handle) }))
    : layer.handle.stack ? inventario(layer.handle) : []);
}
try {
  const contract = JSON.parse(await readFile(new URL('../docs/rutas.json', import.meta.url), 'utf8'));
  const actual = inventario(routes), keys = new Set();
  assert.equal(actual.length, contract.length + 1);
  const seen = new Set();
  for (const row of actual) {
    const key = row.method + ' ' + row.path.replace(/:[^/]+/g, ':id');
    assert.ok(!keys.has(key), `Ruta duplicada: ${key}`); keys.add(key);
    if (row.path === '/api/status') { assert.equal(row.method, 'GET'); continue; }
    const expected = contract.find(item => item.method === row.method && item.path === row.path);
    assert.ok(expected, `Ruta sin contrato: ${key}`);
    const controller = await import('../src/Controllers/' + expected.controller);
    assert.equal(row.handlers.at(-1), controller[expected.handler], `Controlador incorrecto: ${key}`);
    seen.add(controller[expected.handler]);
    if (expected.perfil === 'webhook') {
      assert.equal(row.method,'POST');
      assert.deepEqual(row.handlers.slice(0,-1),[MP.autenticarWebhookMP,Http.jsonAuth]);
    }
    if (expected.perfil === 'checkout') {
      assert.deepEqual(row.handlers.slice(0,3),[Security.protegerOrigen,Checkout.limitarCheckout,Checkout.tokenCompra]);
    }
    if (expected.perfil === 'checkout_cookie') {
      assert.deepEqual(row.handlers.slice(0,3),[Security.protegerOrigen,Checkout.limitarCheckout,Checkout.cookieCompra]);
    }
    if (expected.perfil === 'checkout_preparar') {
      assert.deepEqual(row.handlers.slice(0,3),[Security.protegerOrigen,Checkout.limitarCheckout,Checkout.origenNavegador]);
    }
    if (expected.perfil === 'catalogo') {
      assert.equal(row.method, 'GET', 'El catálogo público es de solo lectura.');
      assert.deepEqual(row.handlers.slice(0, -1), [Security.protegerOrigen]);
    }
    if (expected.perfil === 'admin' || expected.perfil === 'alumno') {
      assert.deepEqual(row.handlers.slice(0, 3), [Security.autenticar, Security.exigirPasswordActualizada,
        expected.perfil === 'admin' ? Security.soloAdmin : Security.soloAlumno], `Permiso incorrecto: ${key}`);
    }
    if (expected.perfil === 'agenda') {
      assert.deepEqual(row.handlers.slice(0, 2), [Security.autenticar, Security.exigirPasswordActualizada], `Sesión Agenda incorrecta: ${key}`);
      assert.equal(row.handlers.length, ['GET', 'HEAD'].includes(row.method) ? 3 : 4, `Cadena Agenda incorrecta: ${key}`);
    }
    if (!['GET', 'HEAD'].includes(row.method) && expected.handler !== 'CR_Archivo_CTS') {
      assert.ok(row.handlers.includes(expected.modulo === 'agenda' ? Http.jsonAgenda : expected.perfil === 'admin' ? Http.jsonGestion
        : expected.perfil === 'alumno' ? Http.jsonCampus : Http.jsonAuth), `Falta JSON: ${key}`);
    }
    if (expected.handler === 'CR_Archivo_CTS') assert.equal(row.handlers.length, 4, 'Multipart no debe pasar por el parser JSON.');
    if (expected.perfil === 'auth') assert.equal(row.handlers[0],
      ['OBRS_MiPerfil_CTS', 'UR_MiPassword_CTS'].includes(expected.handler) ? Security.autenticar : Security.protegerOrigen);
  }
  const files = new Set(contract.map(item => item.controller));
  let functions = 0;
  for (const file of files) {
    for (const [name, handler] of Object.entries(await import('../src/Controllers/' + file))) {
      if (typeof handler === 'function') { functions++; assert.ok(seen.has(handler), `${file}: ${name} no tiene ruta.`); }
    }
  }
  assert.equal(functions, 133);
  const app = crearApp();
  assert.equal(app.get('trust proxy'), process.env.TRUST_PROXY === 'loopback' ? 'loopback' : false);
  assert.equal(app.get('query parser'), 'simple');
  assert.equal(app.enabled('x-powered-by'), false);
  console.log('Rutas y servidor OK: ' + JSON.stringify({ modulos: 22, rutas: actual.length, controladores: files.size, funciones: functions }));
  console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.close(); }
