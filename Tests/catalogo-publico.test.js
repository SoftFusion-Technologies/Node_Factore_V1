import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
      ['id', 'slug', 'titulo', 'descripcion_corta', 'descripcion', 'precio', 'moneda', 'modalidad', 'orden', 'compra_online_disponible', 'acceso_duracion_cantidad', 'acceso_duracion_unidad', 'tiene_portada'].sort());
    assert.equal(result.body.data[0].tiene_portada, false);
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

  // Benjamin Orellana - 15/11/2026 - Portadas reales por asociación; el resto de los archivos sigue privado.
  await t.test('La portada se sirve por slug, sin cookies ni metadatos privados, y desaparece al quitarla', async st => {
    const storage = await mkdtemp(path.join(tmpdir(), 'factore-portadas-'));
    const anterior = process.env.STORAGE_ROOT;
    process.env.STORAGE_ROOT = storage;
    st.after(async () => {
      if (anterior === undefined) delete process.env.STORAGE_ROOT;
      else process.env.STORAGE_ROOT = anterior;
      await rm(storage, { recursive: true, force: true });
    });
    const { inicializarStorage } = await import('../src/Services/Archivo/rutasArchivo.service.js');
    await inicializarStorage();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const uuid = randomUUID(), ruta = 'imagenes/' + uuid + '.png';
    await writeFile(path.join(storage, ruta), png);
    const foto = await modelos.archivos.create({ uuid, tipo: 'IMAGEN', extension: 'png', mime_type: 'image/png',
      estado: 'DISPONIBLE', ruta_relativa: ruta, nombre_guardado: uuid + '.png',
      nombre_original: 'nombre-interno.png', tamanio_bytes: String(png.length), subido_por: admin.id });
    await motor.update({ portada_archivo_id: foto.id });
    await modelos.cursos.update({ portada_archivo_id: foto.id }, { where: { slug: ['oculto', 'archivado'] } });
    const curso = (await get('/api/catalogo/cursos/motor-de-resultados')).body.data;
    assert.equal(curso.tiene_portada, true); assert.equal(curso.portada_archivo_id, undefined);
    const url = base + '/api/catalogo/cursos/motor-de-resultados/portada';
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.doesNotMatch(response.headers.get('content-disposition'), /nombre-interno/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(png.length));
    assert.equal(await head.text(), '');
    const publico = '/api/catalogo/cursos/';
    for (const slug of ['oculto', 'archivado', 'inexistente', String(foto.id)]) {
      assert.equal((await get(publico + slug + '/portada')).status, 404);
    }
    assert.equal((await get(publico + motor.slug + '/portada?archivo_id=' + foto.id)).status, 422);
    assert.equal((await get('/api/admin/archivos/' + foto.id + '/contenido')).status, 401);
    await foto.update({ estado: 'PENDIENTE_ELIMINACION' });
    assert.equal((await get(publico + motor.slug + '/portada')).status, 404);
    await foto.update({ estado: 'DISPONIBLE' });
    await motor.update({ portada_archivo_id: null });
    assert.equal((await get(publico + motor.slug + '/portada')).status, 404);
    assert.equal((await get(publico + motor.slug)).body.data.tiene_portada, false);
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
