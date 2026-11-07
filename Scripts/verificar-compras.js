/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 22/10/2026 - Catálogo actualizado con la configuración comercial de Agenda. */
/* Benjamin Orellana - 20/10/2026 - Verificación compatible con modelos de Agenda. */
/* Benjamin Orellana - 13/10/2026 - Verificación local de servicios de compras. */
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { initRelaciones } from '../src/Models/relaciones.js';
import * as compras from '../src/Services/Compra/compra.service.js';
try {
  initRelaciones();
  assert.equal(Object.keys(modelos).length,31);
  for(const name of ['crearCompra','obtenerCompra','cancelarCompra'])assert.equal(typeof compras[name],'function');
  assert.ok(modelos.compras.associations.items);
  assert.ok(modelos.compra_items.associations.curso);
  assert.ok(modelos.compras.options.defaultScope.attributes.exclude.includes('token_hash'));
  console.log('Compras OK: 2 modelos nuevos, 3 operaciones internas, sin cobros ni asignaciones.');
  console.log('No se abrió una conexión a MySQL.');
} catch(error) { console.error(error.message);process.exitCode=1; }
finally { await db.close(); }
