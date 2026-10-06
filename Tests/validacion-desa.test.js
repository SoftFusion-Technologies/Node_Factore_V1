import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, unlink, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { conectarPrueba } from './adapter-crm.js';
import { inicializarStorage } from '../src/Services/Archivo/rutasArchivo.service.js';
import { validarDesa, verificarArchivoDesa } from '../src/Services/Sistema/validacionDesa.service.js';

test('Cierre DESA: consultas reales aisladas y disco privado; nunca escribe ni borra', async t => {
  const adapter = await conectarPrueba(db, { fixture: 'campus.sqlite.sql' });
  const storage = await mkdtemp(path.join(os.tmpdir(), 'factore-cierre-'));
  const originalQuery = db.query.bind(db);
  // Única traducción de dialecto adicional: resta de 24 horas. Todo el resto
  // del SELECT de diagnóstico se ejecuta contra las tablas/vistas reales del fixture.
  db.query = (sql, options) => originalQuery(typeof sql === 'string'
    ? sql.replace('DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)', "strftime('%Y-%m-%d %H:%M:%f','now','-24 hours')") : sql, options);
  const previousStorage = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = storage;
  await inicializarStorage();
  t.after(async () => {
    db.query = originalQuery;
    if (previousStorage === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = previousStorage;
    await adapter.close(); await rm(storage, { recursive: true, force: true });
  });
  const admin = await modelos.usuarios.create({ nombre: 'Admin de prueba', email: 'cierre@example.invalid', rol: 'ADMIN', estado: 'ACTIVO', password_hash: 'HASH_PRIVADO_DE_PRUEBA' });
  const client = await modelos.crm_clientes.create({ nombre: 'Cliente sin cuenta' });
  const course = await modelos.cursos.create({ titulo: 'Curso publicado sin contenido', slug: 'cierre-desa', estado: 'PUBLICADO', creado_por: admin.id });
  const module = await modelos.curso_modulos.create({ curso_id: course.id, titulo: 'Módulo' });
  const bytes = Buffer.from('contenido privado del archivo'), uuid = randomUUID();
  const relative = `videos/${uuid}.mp4`, full = path.join(storage, relative);
  await writeFile(full, bytes);
  const file = await modelos.archivos.create({ uuid, tipo: 'VIDEO', nombre_original: 'secreto.mp4', nombre_guardado: uuid + '.mp4', ruta_relativa: relative, mime_type: 'video/mp4', extension: 'mp4', tamanio_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), estado: 'DISPONIBLE', subido_por: admin.id });
  const startRead = () => adapter.statements.length;
  const assertOnlyReads = start => assert.ok(adapter.statements.slice(start).every(sql => /^SELECT\b/i.test(sql)), adapter.statements.slice(start).join('\n'));

  await t.test('Ficha sin cuenta y curso sin contenido son válidos; diagnóstico no expone secretos', async () => {
    const start = startRead(), result = await validarDesa({ hash: true });
    assert.equal(result.ok, true); assert.equal(result.advertencias.CURSOS_PUBLICADOS_SIN_CONTENIDO_APTO, '1');
    assert.equal(result.almacenamiento.archivos_revisados, '1');
    assert.deepEqual(result.credenciales.eliminados, { sesiones: 0, tokens: 0 });
    assert.ok(!/HASH_PRIVADO|secreto.mp4|ruta_relativa|sha256|example.invalid|contenido privado/.test(JSON.stringify(result)));
    assertOnlyReads(start); assert.deepEqual(await readFile(full), bytes);
  });
  await t.test('Password activo ausente, acceso a administrador y logo de video se detectan', async () => {
    await admin.update({ password_hash: null });
    const access = await modelos.curso_accesos.create({ usuario_id: admin.id, curso_id: course.id, asignado_por: admin.id, alcance: 'SELECCION' });
    const commerce = await modelos.comercios_amigos.create({ nombre: 'Comercio prueba', slug: 'comercio-cierre', logo_archivo_id: file.id });
    const start = startRead(), result = await validarDesa();
    assert.equal(result.ok, false);
    for (const code of ['CUENTAS_ACTIVAS_SIN_PASSWORD','ACCESOS_A_ADMINISTRADORES','SELECCION_ACTIVA_VACIA','IMAGENES_INVALIDAS']) assert.equal(result.errores[code], '1', code);
    assertOnlyReads(start);
    await commerce.update({ logo_archivo_id: null }); await access.destroy(); await admin.update({ password_hash: 'HASH_PRIVADO_DE_PRUEBA' });
  });
  await t.test('Revocar conserva progreso histórico sin convertirlo en error', async () => {
    const user = await modelos.usuarios.create({ nombre: 'Alumno', email: 'alumno-cierre@example.invalid', cliente_id: client.id, rol: 'ALUMNO', estado: 'ACTIVO', password_hash: 'HASH_PRIVADO' });
    const lesson = await modelos.curso_lecciones.create({ curso_id: course.id, modulo_id: module.id, titulo: 'Lección', estado: 'PUBLICADA', video_archivo_id: file.id });
    await modelos.curso_accesos.create({ usuario_id: user.id, curso_id: course.id, asignado_por: admin.id, estado: 'REVOCADO' });
    const progress = await modelos.leccion_progreso.create({ usuario_id: user.id, curso_id: course.id, leccion_id: lesson.id, estado: 'COMPLETADA', completada_en: new Date(), posicion_segundos: 8 });
    const start = startRead(), result = await validarDesa({ hash: true });
    assert.equal(result.ok, true); assert.equal(result.advertencias.CURSOS_PUBLICADOS_SIN_CONTENIDO_APTO, '0');
    assertOnlyReads(start); assert.equal((await modelos.leccion_progreso.findByPk(progress.id)).estado, 'COMPLETADA');
  });
  await t.test('Tamaño distinto, corrupción de igual tamaño y ausencia física son visibles', async () => {
    await writeFile(full, 'corto');
    assert.equal((await verificarArchivoDesa(file, { hash: true })).codigo, 'TAMANIO_DISTINTO');
    await writeFile(full, Buffer.alloc(bytes.length, 120));
    assert.equal(await verificarArchivoDesa(file), null);
    assert.equal((await verificarArchivoDesa(file, { hash: true })).codigo, 'SHA256_DISTINTO');
    await unlink(full);
    const result = await validarDesa({ hash: true }); assert.equal(result.ok, false);
    assert.equal(result.almacenamiento.incidencias[0].codigo, 'ARCHIVO_FISICO_AUSENTE');
    await writeFile(full, bytes);
  });
  await t.test('Symlink se rechaza y su destino conserva bytes', async () => {
    const target = path.join(storage, 'destino.txt'); await writeFile(target, bytes);
    await unlink(full); await symlink(target, full);
    assert.equal((await verificarArchivoDesa(file)).codigo, 'ARCHIVO_NO_VERIFICABLE');
    assert.deepEqual(await readFile(target), bytes); await unlink(full); await writeFile(full, bytes);
  });
  await t.test('Eliminado en disco se detecta; faltante con comprobante es válido', async () => {
    const other = randomUUID(), disk = path.join(storage, 'documentos', other + '.pdf');
    const deleted = await modelos.archivos.create({ uuid: other, tipo: 'DOCUMENTO', nombre_original: 'eliminado.pdf', nombre_guardado: other + '.pdf', ruta_relativa: `documentos/${other}.pdf`, mime_type: 'application/pdf', extension: 'pdf', tamanio_bytes: 3, estado: 'ELIMINADO', eliminado_en: new Date(), subido_por: admin.id });
    await modelos.archivos_eliminaciones.create({ archivo_id: deleted.id, solicitado_por: admin.id, estado: 'COMPLETADA', completada_en: new Date() });
    await writeFile(disk, 'pdf');
    const start = startRead(), result = await validarDesa();
    assert.equal(result.ok, false); assert.equal(result.almacenamiento.incidencias[0].codigo, 'ELIMINADO_PRESENTE_EN_DISCO');
    assertOnlyReads(start); assert.equal((await readFile(disk)).toString(), 'pdf');
    await unlink(disk); assert.equal((await validarDesa({ hash: true })).ok, true);
  });
  await t.test('Pendientes y credenciales antiguas se informan sin ejecutar mantenimiento', async () => {
    const uploadId = randomUUID(), pendingId = randomUUID(), old = new Date(Date.now() - 40 * 86400000);
    await modelos.archivos.create({ uuid: uploadId, tipo: 'VIDEO', nombre_original: 'abandonado.mp4', nombre_guardado: uploadId + '.mp4', ruta_relativa: `videos/${uploadId}.mp4`, mime_type: 'video/mp4', extension: 'mp4', tamanio_bytes: 3, estado: 'SUBIENDO', creado_en: old, subido_por: admin.id });
    const pending = await modelos.archivos.create({ uuid: pendingId, tipo: 'VIDEO', nombre_original: 'pendiente.mp4', nombre_guardado: pendingId + '.mp4', ruta_relativa: `videos/${pendingId}.mp4`, mime_type: 'video/mp4', extension: 'mp4', tamanio_bytes: 3, estado: 'PENDIENTE_ELIMINACION', subido_por: admin.id });
    const job = await modelos.archivos_eliminaciones.create({ archivo_id: pending.id, solicitado_por: admin.id });
    const token = await modelos.usuarios_tokens.create({ usuario_id: admin.id, tipo: 'RECUPERACION', token_hash: 'token-ficticio-cierre', creado_en: new Date(Date.now() - 50 * 86400000), vence_en: old });
    const start = startRead(), result = await validarDesa({ hash: true });
    assertOnlyReads(start); assert.equal(result.ok, true);
    assert.equal(result.advertencias.ELIMINACIONES_PENDIENTES, '1'); assert.equal(result.advertencias.SUBIDAS_ABANDONADAS, '1');
    assert.equal(result.credenciales.candidatos.tokens, 1); assert.equal(result.credenciales.eliminados.tokens, 0);
    assert.ok(await modelos.usuarios_tokens.findByPk(token.id)); assert.equal((await modelos.archivos_eliminaciones.findByPk(job.id)).estado, 'PENDIENTE');
    assert.equal((await verificarArchivoDesa({ ...file.get(), id: '18446744073709551615', tamanio_bytes: 1 })).archivo_id, '18446744073709551615');
  });
  await t.test('201 archivos pasan la primera página; más de 20 incidencias conservan el total', async () => {
    for (let i = 0; i < 201; i++) {
      const next = randomUUID();
      await modelos.archivos.create({ uuid: next, tipo: 'VIDEO', nombre_original: 'prueba.mp4', nombre_guardado: next + '.mp4', ruta_relativa: `videos/${next}.mp4`, mime_type: 'video/mp4', extension: 'mp4', tamanio_bytes: 3, estado: 'DISPONIBLE', subido_por: admin.id });
    }
    const start = startRead(), result = await validarDesa();
    assertOnlyReads(start); assert.equal(result.ok, false); assert.equal(result.almacenamiento.archivos_revisados, '203');
    assert.equal(result.almacenamiento.incidencias_total, '201'); assert.equal(result.almacenamiento.incidencias.length, 20);
  });
});

test('CLI: importación local no conecta a MySQL y argumentos libres se rechazan', () => {
  const cwd = new URL('../', import.meta.url);
  const local = spawnSync(process.execPath, ['Scripts/validar-desa.js'], { cwd, encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr); assert.equal(JSON.parse(local.stdout).conexion_mysql, false);
  for (const args of [['--hash'], ['--aplicar'], ['--db','--db']]) {
    const result = spawnSync(process.execPath, ['Scripts/validar-desa.js', ...args], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stderr).error, 'VALIDACION_DESA_NO_COMPLETADA');
  }
});
