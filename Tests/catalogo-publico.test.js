import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.NODE_ENV = 'test';
process.env.DB_PASSWORD = 'Credencial ficticia del adaptador de pruebas';
process.env.FRONTEND_URL = 'http://127.0.0.1:5173';
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:5173';
process.env.TRUST_PROXY = 'false';
const { default: db } = await import('../src/DataBase/db.js');
const { modelos } = await import('../src/Models/index.js');
const { crearApp } = await import('../app.js');
const { conectarPrueba } = await import('./adapter-crm.js');

test('Catálogo público: HTTP real y SQL Sequelize sobre SQLite aislado', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const server = crearApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await adapter.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = await modelos.usuarios.create({ nombre: 'Juan prueba', email: 'catalogo@example.invalid', rol: 'ADMIN' });
  const motor = await modelos.cursos.create({ titulo: 'Motor de Resultados', slug: 'motor-de-resultados',
    precio: '350000.00', creado_por: admin.id, estado: 'PUBLICADO', visible_catalogo: 1, orden: 1, venta_online_habilitada: 1 });
  const kit = await modelos.cursos.create({ titulo: 'Kit Emprendedor', slug: 'kit-emprendedor',
    precio: '220000.50', creado_por: admin.id, visible_catalogo: 1, orden: 2 });
  await modelos.cursos.create({ titulo: 'Oculto', slug: 'oculto', creado_por: admin.id, estado: 'PUBLICADO', visible_catalogo: 0 });
  await modelos.cursos.create({ titulo: 'Archivado', slug: 'archivado', creado_por: admin.id, estado: 'ARCHIVADO', visible_catalogo: 1 });

  async function get(path, options = {}) {
    const response = await fetch(base + path, options);
    return { status: response.status, headers: response.headers, body: await response.json() };
  }

  await t.test('Sin cookie: listado ordenado, IDs y precios exactos; solo SELECT', async () => {
    const start = adapter.statements.length;
    const result = await get('/api/catalogo/cursos');
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('set-cookie'), null);
    assert.deepEqual(result.body.data.map(x => x.id), [String(motor.id), String(kit.id)]);
    assert.equal(result.body.data[1].precio, '220000.50');
    assert.equal(result.body.data[0].compra_online_disponible, true);
    assert.equal(result.body.data[1].compra_online_disponible, false);
    assert.equal(result.body.data[0].acceso_duracion_cantidad, 1);
    assert.equal(result.body.data[0].acceso_duracion_unidad, 'MESES');
    assert.deepEqual(Object.keys(result.body.data[0]).sort(),
      ['id', 'slug', 'titulo', 'descripcion_corta', 'descripcion', 'precio', 'moneda', 'modalidad', 'orden', 'compra_online_disponible', 'acceso_duracion_cantidad', 'acceso_duracion_unidad'].sort());
    assert.ok(adapter.statements.slice(start).every(sql => /^SELECT/.test(sql)));
    assert.equal((await get('/api/admin/cursos')).status, 401);
    assert.equal((await get('/api/campus/cursos')).status, 401);
  });

  await t.test('Borrador visible se ofrece comercialmente; oculto y archivado devuelven 404', async () => {
    assert.equal((await get('/api/catalogo/cursos/kit-emprendedor')).status, 200);
    for (const slug of ['oculto', 'archivado', 'inexistente']) {
      assert.equal((await get('/api/catalogo/cursos/' + slug)).status, 404);
    }
    assert.equal((await modelos.cursos.findByPk(kit.id)).estado, 'BORRADOR');
  });

  await t.test('Venta online exige publicado, bandera, importe positivo y ARS; no filtra estado ni archivos', async () => {
    for (const patch of [{ venta_online_habilitada: 0 }, { precio: '0.00' }, { moneda: 'USD' }, { estado: 'BORRADOR' }]) {
      await motor.update({ estado: 'PUBLICADO', precio: '350000.00', moneda: 'ARS', venta_online_habilitada: 1, ...patch });
      const result = (await get('/api/catalogo/cursos/motor-de-resultados')).body.data;
      assert.equal(result.compra_online_disponible, false);
      assert.equal(result.estado, undefined); assert.equal(result.venta_online_habilitada, undefined);
      assert.equal(result.portada_archivo_id, undefined);
    }
    await motor.update({ estado: 'PUBLICADO', precio: '350000.00', moneda: 'ARS', venta_online_habilitada: 1 });
    assert.equal((await get('/api/catalogo/cursos/motor-de-resultados')).body.data.compra_online_disponible, true);
  });

  await t.test('Edición y ocultación se reflejan en el siguiente GET', async () => {
    await modelos.cursos.update({ precio: '245000.25', titulo: 'Kit actualizado' }, { where: { id: kit.id } });
    let result = await get('/api/catalogo/cursos/kit-emprendedor');
    assert.equal(result.body.data.precio, '245000.25');
    assert.equal(result.body.data.titulo, 'Kit actualizado');
    await modelos.cursos.update({ visible_catalogo: 0 }, { where: { id: kit.id } });
    assert.equal((await get('/api/catalogo/cursos/kit-emprendedor')).status, 404);
    assert.equal((await get('/api/catalogo/cursos')).body.data.length, 1);
  });

  await t.test('No admite escrituras públicas, filtros libres ni rutas privadas', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      assert.equal((await get('/api/catalogo/cursos', { method })).status, 404);
    }
    for (const path of ['/api/catalogo/cursos?estado=ARCHIVADO', '/api/catalogo/cursos?usuario_id=3',
      '/api/catalogo/cursos/1%20OR%201=1']) assert.equal((await get(path)).status, 422);
    assert.equal((await get('/api/catalogo/cursos/motor-de-resultados/video')).status, 404);
    assert.equal((await get('/api/catalogo/cursos', { headers: { Origin: 'https://ajeno.example.invalid' } })).status, 403);
  });

  await t.test('Listados superiores a 100 registros sin recorte implícito', async () => {
    for (let n = 0; n < 110; n++) {
      await modelos.cursos.create({ titulo: `Curso ${n}`, slug: `curso-${n}`, creado_por: admin.id,
        estado: 'PUBLICADO', visible_catalogo: 1, orden: n + 3 });
    }
    const result = await get('/api/catalogo/cursos');
    assert.equal(result.body.data.length, 111);
    assert.equal(result.body.data.at(-1).slug, 'curso-109');
  });
});
