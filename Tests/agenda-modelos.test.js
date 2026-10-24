/* Benjamin Orellana - 20/10/2026 - Integridad de Agenda con Sequelize y SQLite aislado. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QueryTypes } from 'sequelize';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { initRelaciones } from '../src/Models/relaciones.js';
import { conectarPrueba } from './adapter-crm.js';

// Benjamin Orellana - 21/10/2026 - Distinguir las pruebas de modelos de las nuevas pruebas HTTP.
test('Agenda: integridad y propiedad de los modelos, sin conexión a MySQL DESA', async t => {
  const adapter = await conectarPrueba(db, { extras: ['agenda.sqlite.sql'] });
  t.after(() => adapter.close());
  initRelaciones();
  const m = modelos;
  const [juan, ana, luz] = await Promise.all(['Juan', 'Ana', 'Luz'].map(nombre =>
    m.usuarios.create({ nombre, email: nombre.toLowerCase() + '@example.invalid', rol: 'ADMIN' })));
  const diaAna = await m.agenda_dias.create({ usuario_id: ana.id, fecha: '2026-10-20' });
  const diaAna2 = await m.agenda_dias.create({ usuario_id: ana.id, fecha: '2026-10-21' });
  const diaLuz = await m.agenda_dias.create({ usuario_id: luz.id, fecha: '2026-10-20' });
  const propio = { usuario_id: ana.id, dia_id: diaAna.id };
  const select = sql => db.query(sql, { type: QueryTypes.SELECT });

  await t.test('La migración y el fixture conservan las mismas restricciones y columnas', async () => {
    const mysql = await readFile(new URL('../docs/sql/AGENDA_ETAPA1.sql', import.meta.url), 'utf8');
    const sqlite = await readFile(new URL('./fixtures/agenda.sqlite.sql', import.meta.url), 'utf8');
    const restricciones = sql => [...sql.matchAll(/^\s*CONSTRAINT ([^\n]+)$/gm)]
      .map(match => match[1].replace(/\s+/g, ' ').trim().replace(/,$/, ''));
    assert.equal(restricciones(mysql).length, 31);
    assert.deepEqual(restricciones(sqlite), restricciones(mysql));
    for (const [tabla, modelo] of Object.entries(m).filter(([nombre]) => nombre.startsWith('agenda_') && !['agenda_venta_configuracion', 'agenda_compras'].includes(nombre))) {
      const columnas = await select('PRAGMA table_info(' + tabla + ')');
      assert.deepEqual(columnas.map(c => c.name), Object.keys(modelo.rawAttributes));
    }
  });

  await t.test('Sin filas no hay accesos; crear una fila sin estado queda REVOCADO, incluso para ADMIN', async () => {
    assert.equal(await m.agenda_accesos.count(), 0);
    const acceso = await m.agenda_accesos.create({ usuario_id: ana.id, otorgado_por: juan.id });
    assert.equal(acceso.estado, 'REVOCADO');
    assert.equal(String(acceso.otorgado_por), String(juan.id));
    assert.equal(await m.agenda_accesos.count({ where: { estado: 'ACTIVO' } }), 0);
    await assert.rejects(() => m.agenda_accesos.create({ usuario_id: ana.id }));
    await assert.rejects(() => m.agenda_accesos.create({ usuario_id: luz.id,
      inicio_en: '2026-10-20T12:00:00.000Z', vence_en: '2026-10-20T12:00:00.000Z' }));
    await assert.rejects(() => m.agenda_accesos.create({ usuario_id: '999999', otorgado_por: juan.id }));
  });

  await t.test('Un día por usuario y fecha de calendario; preferencias únicas con tema propio', async () => {
    assert.equal((await diaAna.reload()).fecha, '2026-10-20');
    await assert.rejects(() => m.agenda_dias.create({ usuario_id: ana.id, fecha: '2026-10-20' }));
    const pref = await m.agenda_preferencias.create({ usuario_id: ana.id });
    assert.equal(pref.tema, 'CLARO');
    await m.agenda_preferencias.create({ usuario_id: luz.id, tema: 'OSCURO' });
    await assert.rejects(() => m.agenda_preferencias.create({ usuario_id: ana.id }));
    await assert.rejects(() => m.agenda_preferencias.update({ version: 0 }, { where: { id: pref.id } }));
  });

  await t.test('Los pilares vacíos no pueden completarse; cada una de las tres prioridades es independiente', async () => {
    for (const n of [1, 2, 3]) {
      await assert.rejects(() => m.agenda_dias.update({ ['prioridad_' + n + '_cumplida']: 1 }, { where: { id: diaAna.id } }));
    }
    await diaAna.update({ frase: 'Un paso por vez', prioridad_1_texto: 'Planificar la semana', prioridad_1_cumplida: 1,
      prioridad_2_texto: 'Revisar objetivos', prioridad_3_texto: 'Descansar' });
    assert.equal((await diaAna.reload()).prioridad_1_cumplida, 1);
    assert.equal(diaAna.prioridad_2_cumplida, 0);
    await assert.rejects(() => m.agenda_dias.update({ prioridad_1_texto: '   ' }, { where: { id: diaAna.id } }));
    await assert.rejects(() => m.agenda_dias.update({ prioridad_2_cumplida: 2 }, { where: { id: diaAna.id } }));
  });

  await t.test('Tareas, notas y tiempos no admiten un día de otro propietario', async () => {
    const ajeno = { usuario_id: ana.id, dia_id: diaLuz.id };
    await assert.rejects(() => m.agenda_tareas.create({ ...ajeno, texto: 'No debe guardarse', categoria: 'OPERATIVO' }));
    await assert.rejects(() => m.agenda_notas.create({ ...ajeno, texto: 'Nota ajena' }));
    await assert.rejects(() => m.agenda_tiempo_registros.create({ ...ajeno, categoria: 'PERSONAL', inicio_en: '2026-10-20T12:00:00Z' }));
    assert.equal(await m.agenda_tareas.count(), 0);
    assert.equal(await m.agenda_notas.count(), 0);
    assert.equal(await m.agenda_tiempo_registros.count(), 0);
  });

  let tarea;
  await t.test('Prioridad, hora, recordatorio y fecha de compleción deben ser coherentes', async () => {
    const base = { ...propio, texto: 'Preparar propuesta', categoria: 'COMERCIAL' };
    for (const cambio of [{ prioridad: 4 }, { hora: '24:00:00' }, { hora: '12:30:12' }, { recordatorio: 1 },
      { texto: '  ' }, { completada: 1 }, { completada_en: '2026-10-20T13:00:00Z' },
      { recordada_en: '2026-10-20T13:00:00Z' }]) {
      await assert.rejects(() => m.agenda_tareas.create({ ...base, ...cambio }));
    }
    tarea = await m.agenda_tareas.create({ ...base, hora: '12:30:00', prioridad: 1, recordatorio: 1 });
    await tarea.update({ completada: 1, completada_en: '2026-10-20T16:00:00Z' });
    await tarea.reload();
    assert.equal(tarea.completada, 1);
    assert.equal(tarea.prioridad, 1);
  });

  await t.test('Mover una tarea completada conserva sus datos y rechaza cambiarla al día de otra cuenta', async () => {
    const completada = String(tarea.completada_en);
    await tarea.update({ dia_id: diaAna2.id, categoria: 'ESTRATEGICO' });
    await assert.rejects(() => m.agenda_tareas.update({ dia_id: diaLuz.id }, { where: { id: tarea.id } }));
    await tarea.reload();
    assert.equal(String(tarea.dia_id), String(diaAna2.id));
    assert.equal(tarea.completada, 1);
    assert.equal(String(tarea.completada_en), completada);
    assert.equal(tarea.hora, '12:30:00');
    const dia = await m.agenda_dias.findOne({ where: { id: diaAna2.id, usuario_id: ana.id }, include: ['tareas'] });
    assert.equal(dia.tareas.length, 1);
    assert.equal(await m.agenda_dias.findOne({ where: { id: diaAna2.id, usuario_id: luz.id } }), null);
  });

  await t.test('Notas con saltos de línea: reordenar y mover juntos revierte por completo si una relación es ajena', async () => {
    const n1 = await m.agenda_notas.create({ ...propio, texto: 'Primera línea\nSegunda línea ✓', orden: 0 });
    const n2 = await m.agenda_notas.create({ ...propio, texto: 'Otra nota', orden: 1, cumplida: 1 });
    await assert.rejects(() => db.transaction(async transaction => {
      await n1.update({ orden: 1 }, { transaction });
      await n2.update({ orden: 0, dia_id: diaLuz.id }, { transaction });
    }));
    await n1.reload(); await n2.reload();
    assert.equal(n1.orden, 0); assert.equal(n2.orden, 1);
    await db.transaction(async transaction => {
      await n1.update({ orden: 1 }, { transaction });
      await n2.update({ orden: 0 }, { transaction });
    });
    const notas = await m.agenda_notas.findAll({ where: propio, order: [['orden', 'ASC'], ['id', 'ASC']] });
    assert.deepEqual(notas.map(n => String(n.id)), [String(n2.id), String(n1.id)]);
    assert.equal(notas[1].texto, 'Primera línea\nSegunda línea ✓');
  });

  await t.test('Cronómetros: cuatro categorías simultáneas, uno abierto por categoría y varios tramos cerrados', async () => {
    const categorias = ['OPERATIVO', 'COMERCIAL', 'ESTRATEGICO', 'PERSONAL'];
    const abiertos = [];
    for (const categoria of categorias) abiertos.push(await m.agenda_tiempo_registros.create({
      ...propio, categoria, inicio_en: '2026-10-20T12:00:00Z'
    }));
    await assert.rejects(() => m.agenda_tiempo_registros.create({ ...propio,
      dia_id: diaAna2.id, categoria: 'OPERATIVO', inicio_en: '2026-10-20T12:01:00Z' }));
    await assert.rejects(() => m.agenda_tiempo_registros.create({ ...propio,
      categoria: 'OPERATIVO', inicio_en: '2026-10-20T12:00:00Z', en_curso: null }));
    await assert.rejects(() => abiertos[0].update({ fin_en: '2026-10-20T11:59:00Z', duracion_segundos: 10, en_curso: null }));
    await abiertos[0].reload();
    await abiertos[0].update({ fin_en: '2026-10-20T12:01:00Z', duracion_segundos: 60, en_curso: null });
    const segundo = await m.agenda_tiempo_registros.create({ ...propio,
      categoria: 'OPERATIVO', inicio_en: '2026-10-20T12:02:00Z' });
    await segundo.update({ fin_en: '2026-10-20T12:03:00Z', duracion_segundos: 60, en_curso: null });
    assert.equal(await m.agenda_tiempo_registros.count({ where: { ...propio, en_curso: null } }), 2);
    assert.equal(await m.agenda_tiempo_registros.count({ where: { ...propio, en_curso: 1 } }), 3);
    await segundo.destroy();
    const cerrados = await m.agenda_tiempo_registros.findAll({ where: { ...propio, en_curso: null } });
    assert.equal(cerrados.reduce((total, registro) => total + registro.duracion_segundos, 0), 60);
  });

  await t.test('La versión permite detectar dos ediciones del mismo estado sin sobrescribir el primer cambio', async () => {
    const inicial = (await diaAna.reload()).version;
    const [primero] = await m.agenda_dias.update({ frase: 'Edición confirmada', version: inicial + 1 },
      { where: { id: diaAna.id, usuario_id: ana.id, version: inicial } });
    const [segundo] = await m.agenda_dias.update({ frase: 'Edición anterior', version: inicial + 1 },
      { where: { id: diaAna.id, usuario_id: ana.id, version: inicial } });
    assert.equal(primero, 1); assert.equal(segundo, 0);
    assert.equal((await diaAna.reload()).frase, 'Edición confirmada');
  });

  await t.test('Revocar un acceso no borra datos; eliminar un día o usuario con contenido queda restringido', async () => {
    const previas = await m.agenda_tareas.count({ where: { usuario_id: ana.id } });
    await m.agenda_accesos.update({ estado: 'ACTIVO' }, { where: { usuario_id: ana.id } });
    await m.agenda_accesos.update({ estado: 'REVOCADO' }, { where: { usuario_id: ana.id } });
    assert.equal(await m.agenda_tareas.count({ where: { usuario_id: ana.id } }), previas);
    await assert.rejects(() => diaAna.destroy());
    await assert.rejects(() => ana.destroy());
  });
});
