/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 22/10/2026 - Catálogo actualizado con la configuración comercial de Agenda. */
/* Benjamin Orellana - 20/10/2026 - Verificación compatible con modelos de Agenda. */
/* Benjamin Orellana - 04/10/2026 - Verificación de modelos y relaciones de Factor E. */
import assert from 'node:assert/strict';
import { QueryTypes } from 'sequelize';
import db from '../src/DataBase/db.js';
import { DB_NAME, validarConfiguracionDB } from '../src/DataBase/config.js';
import { modelos } from '../src/Models/index.js';
import { initRelaciones, clavesForaneasCompuestas } from '../src/Models/relaciones.js';

const vistas = [
  'vw_accesos_estado', 'vw_campus_lecciones_habilitadas',
  'vw_campus_progreso_cursos', 'vw_campus_comercios_visibles'
];

function normalizarTipo(value) {
  const type = value.trim();
  if (/^enum/i.test(type)) return 'enum' + type.slice(4).replace(/,\s+/g, ',');
  return type.toLowerCase().replace(/\binteger\b/g, 'int')
    .replace(/\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/g, '$1')
    .replace(/\s+binary\b/g, '').replace(/\s+/g, ' ');
}

function verificarLocales() {
  assert.equal(Object.keys(modelos).length, 31, 'Se esperan 31 modelos.');
  const camposAntes = Object.fromEntries(Object.entries(modelos).map(([table, model]) =>
    [table, Object.keys(model.rawAttributes)]));
  initRelaciones();
  const count = () => Object.values(modelos).reduce((n, m) => n + Object.keys(m.associations).length, 0);
  const relaciones = count();
  initRelaciones();
  assert.equal(count(), relaciones, 'Las relaciones deben poder inicializarse dos veces sin duplicados.');
  let campos = 0;
  for (const [table, model] of Object.entries(modelos)) {
    assert.equal(model.tableName, table);
    assert.equal(model.options.timestamps, false);
    assert.deepEqual(Object.keys(model.rawAttributes), camposAntes[table], `${table}: asociación agregó campos.`);
    assert.deepEqual(model.primaryKeyAttributes, ['id']);
    // Benjamin Orellana - 22/10/2026 - Solo la configuración única usa ID fijo, sin autoincremento.
    assert.equal(model.rawAttributes.id.autoIncrement, table !== 'agenda_venta_configuracion', `${table}: autoincremento del modelo incorrecto.`);
    assert.equal(normalizarTipo(model.rawAttributes.id.type.toSql()), 'bigint unsigned');
    campos += Object.keys(model.rawAttributes).length;
    for (const relation of Object.values(model.associations)) {
      assert.ok(relation.target.sequelize === db, `${table}: conexión de relación incorrecta.`);
      if (relation.associationType !== 'BelongsToMany') {
        const owner = relation.associationType === 'BelongsTo' ? model : relation.target;
        assert.ok(owner.rawAttributes[relation.foreignKey], `${table}: campo FK inexistente.`);
      }
    }
  }
  assert.equal(campos, 338, 'La estructura instalada contiene 338 columnas.');
  assert.equal(relaciones, 110, 'Se esperan 110 asociaciones, incluidas las inversas y comerciales.');
  for (const [table, secret] of [['compras','token_hash'],['usuarios','password_hash'],['usuarios_sesiones','token_hash'],['usuarios_tokens','token_hash']]) {
    assert.ok(modelos[table].options.defaultScope.attributes.exclude.includes(secret));
    assert.deepEqual(modelos[table].scope('conHash')._scope.attributes.exclude, []);
  }
  assert.deepEqual(modelos.agenda_google_conexiones.options.defaultScope.attributes.exclude, ['refresh_cifrado', 'intento_cifrado']);
  return { modelos: 31, campos, asociaciones: relaciones };
}

async function verificarMySQL() {
  validarConfiguracionDB();
  await db.authenticate();
  const select = (sql, replacements = {}) => db.query(sql, { type: QueryTypes.SELECT, replacements });
  const [motor] = await select('SELECT VERSION() AS version, DATABASE() AS base, @@session.time_zone AS zona');
  assert.equal(motor.base, DB_NAME, 'La base conectada no coincide con DB_NAME.');
  assert.equal(motor.zona, '+00:00', 'La conexión debe trabajar en UTC.');
  const schema = { schema: DB_NAME };
  const tables = await select('SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=:schema', schema);
  for (const table of Object.keys(modelos)) {
    assert.ok(tables.some(row => row.TABLE_NAME === table && row.TABLE_TYPE === 'BASE TABLE'), `Falta la tabla ${table}.`);
  }
  for (const vista of vistas) assert.ok(tables.some(row => row.TABLE_NAME === vista && row.TABLE_TYPE === 'VIEW'), `Falta la vista ${vista}.`);
  const columns = await select(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=:schema`, schema);
  for (const [table, model] of Object.entries(modelos)) {
    const actual = columns.filter(row => row.TABLE_NAME === table);
    assert.equal(actual.length, Object.keys(model.rawAttributes).length, `${table}: cantidad de columnas distinta.`);
    for (const [name, attribute] of Object.entries(model.rawAttributes)) {
      const row = actual.find(c => c.COLUMN_NAME === name);
      assert.ok(row, `Falta ${table}.${name}.`);
      assert.equal(normalizarTipo(row.COLUMN_TYPE), normalizarTipo(attribute.type.toSql({escape: value => db.escape(value)})), `${table}.${name}: tipo distinto.`);
      assert.equal(row.IS_NULLABLE === 'YES', attribute.allowNull, `${table}.${name}: nulabilidad distinta.`);
      assert.equal(row.EXTRA.includes('auto_increment'), Boolean(attribute.autoIncrement), `${table}.${name}: autoincremento distinto.`);
      if (attribute.defaultValue !== undefined) {
        const expected = attribute.defaultValue?.val ?? attribute.defaultValue;
        assert.equal(String(row.COLUMN_DEFAULT).toLowerCase(), String(expected).toLowerCase(), `${table}.${name}: valor por defecto distinto.`);
      }
      if (name === 'actualizado_en') assert.ok(row.EXTRA.toLowerCase().includes('on update current_timestamp(3)'), `${table}: falta actualización automática de fecha.`);
    }
  }
  const statistics = await select(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=:schema ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`, schema);
  for (const [table, model] of Object.entries(modelos)) {
    for (const index of [{name:'PRIMARY',unique:true,fields:['id']}, ...model.options.indexes]) {
      const rows = statistics.filter(r => r.TABLE_NAME === table && r.INDEX_NAME === index.name);
      assert.deepEqual(rows.map(r => r.COLUMN_NAME), index.fields, `${table}: índice ${index.name} distinto o ausente.`);
      assert.equal(Number(rows[0].NON_UNIQUE), index.unique ? 0 : 1, `${table}: unicidad de ${index.name} distinta.`);
    }
  }
  const foreignKeys = await select(`SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,
      k.REFERENCED_COLUMN_NAME,r.DELETE_RULE,k.ORDINAL_POSITION
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
    WHERE k.TABLE_SCHEMA=:schema AND k.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION`, schema);
  const grouped = new Map();
  for (const row of foreignKeys) {
    if (!modelos[row.TABLE_NAME]) continue;
    const key = `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`;
    if (!grouped.has(key)) grouped.set(key, {table:row.TABLE_NAME,fields:[],target:row.REFERENCED_TABLE_NAME,targetFields:[],onDelete:row.DELETE_RULE});
    grouped.get(key).fields.push(row.COLUMN_NAME);
    grouped.get(key).targetFields.push(row.REFERENCED_COLUMN_NAME);
  }
  const expectedFK = [...clavesForaneasCompuestas];
  for (const [table, model] of Object.entries(modelos)) {
    for (const [name, attribute] of Object.entries(model.rawAttributes)) {
      if (attribute.references) expectedFK.push({table,fields:[name],target:attribute.references.model,
        targetFields:[attribute.references.key],onDelete:attribute.onDelete});
    }
  }
  const serializar = key => JSON.stringify([key.table,key.fields,key.target,key.targetFields,key.onDelete]);
  assert.equal(expectedFK.length, 48);
  assert.deepEqual([...grouped.values()].map(serializar).sort(), expectedFK.map(serializar).sort(), 'Las 48 claves foráneas no coinciden.');
  const checks = await select(`SELECT TABLE_NAME,CONSTRAINT_NAME,ENFORCED FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=:schema AND CONSTRAINT_TYPE='CHECK'`, schema);
  const ownChecks = checks.filter(c => modelos[c.TABLE_NAME]);
  assert.equal(ownChecks.length, 73, 'Se esperan 73 CHECK en las tablas de Factor E.');
  assert.ok(ownChecks.every(c => c.ENFORCED === 'YES'), 'Hay CHECK no efectivos.');
  const unique = statistics.filter(row => modelos[row.TABLE_NAME] && row.INDEX_NAME !== 'PRIMARY' && Number(row.NON_UNIQUE) === 0);
  assert.equal(new Set(unique.map(row => `${row.TABLE_NAME}.${row.INDEX_NAME}`)).size, 27, 'Se esperan 27 índices únicos.');
  return {...motor, vistas:4, claves_foraneas:48, claves_compuestas:8, checks:73, indices_unicos:27};
}

try {
  assert.ok(process.argv.slice(2).every(arg => arg === '--db'), 'Uso: node Scripts/verificar-modelos.js [--db]');
  const local = verificarLocales();
  console.log('Modelos y relaciones OK:', JSON.stringify(local));
  if (process.argv.includes('--db')) {
    console.log('MySQL OK:', JSON.stringify(await verificarMySQL()));
  } else {
    console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
  }
} catch (error) {
  console.error('Verificación fallida:', error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
