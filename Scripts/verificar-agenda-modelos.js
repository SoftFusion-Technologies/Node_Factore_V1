/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 22/10/2026 - Este verificador conserva el alcance de las seis tablas personales originales. */
/* Benjamin Orellana - 20/10/2026 - Verificación local de la primera etapa de Mi agenda. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { initRelaciones, clavesForaneasCompuestas } from '../src/Models/relaciones.js';

try {
  assert.equal(process.argv.length, 2, 'Uso: node Scripts/verificar-agenda-modelos.js');
  const agenda = Object.entries(modelos).filter(([tabla]) => tabla.startsWith('agenda_') && !['agenda_venta_configuracion', 'agenda_compras'].includes(tabla));
  assert.equal(agenda.length, 6);
  const antes = agenda.map(([, modelo]) => Object.keys(modelo.rawAttributes));
  initRelaciones();
  const asociaciones = agenda.map(([, modelo]) => Object.keys(modelo.associations));
  initRelaciones();

  for (const [i, [tabla, modelo]] of agenda.entries()) {
    assert.equal(modelo.tableName, tabla);
    assert.equal(modelo.options.timestamps, false);
    assert.deepEqual(Object.keys(modelo.rawAttributes), antes[i]);
    assert.deepEqual(Object.keys(modelo.associations), asociaciones[i]);
    assert.equal(modelo.rawAttributes.version.defaultValue, 1);
    assert.ok(modelo.associations.usuario);
  }
  assert.equal(modelos.agenda_accesos.rawAttributes.estado.defaultValue, 'REVOCADO');
  for (const tabla of ['agenda_tareas', 'agenda_notas', 'agenda_tiempo_registros']) {
    assert.ok(clavesForaneasCompuestas.some(fk => fk.table === tabla
      && fk.target === 'agenda_dias'
      && fk.fields.join(',') === 'dia_id,usuario_id'
      && fk.targetFields.join(',') === 'id,usuario_id'));
  }

  const sql = await readFile(new URL('../docs/sql/AGENDA_ETAPA1.sql', import.meta.url), 'utf8');
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS agenda_/g) || []).length, 6);
  // La migración es aditiva: no habilita usuarios ni cambia la base existente.
  const ejecutable = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(ejecutable, /(?:^|;)\s*(INSERT|REPLACE|DELETE|DROP|TRUNCATE|ALTER|GRANT)\b/im);
  for (const [tabla] of agenda) assert.ok(ejecutable.includes('CREATE TABLE IF NOT EXISTS ' + tabla + ' ('));

  console.log('Agenda: modelos y relaciones OK:', JSON.stringify({
    tablas_nuevas: agenda.length, campos_nuevos: antes.flat().length,
    relaciones_propiedad_compuestas: 3, accesos_creados: 0
  }));
  console.log('Verificación local. No se abrió MySQL ni se habilitó una cuenta.');
} catch (error) {
  console.error('Verificación Agenda fallida:', error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
