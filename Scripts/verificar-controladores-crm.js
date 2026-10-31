/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 22/10/2026 - Catálogo actualizado con la configuración comercial de Agenda. */
/* Benjamin Orellana - 20/10/2026 - Verificación compatible con modelos de Agenda. */
/* Benjamin Orellana - 04/10/2026 - Carga local de controladores CRM, sin conexión MySQL. */
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import * as Clientes from '../src/Controllers/Cliente/CTS_TB_Clientes.js';
import * as Notas from '../src/Controllers/Cliente/CTS_TB_ClientesNotas.js';
import * as Comercios from '../src/Controllers/Comercio/CTS_TB_ComerciosAmigos.js';
import * as Vinculos from '../src/Controllers/Comercio/CTS_TB_ComercioClientes.js';
import { modelos } from '../src/Models/index.js';

try {
  assert.equal(Object.keys(modelos).length, 30);
  let funciones = 0;
  for (const module of [Clientes, Notas, Comercios, Vinculos]) {
    for (const [name, handler] of Object.entries(module)) {
      assert.match(name, /_CTS$/);
      assert.equal(typeof handler, 'function');
      funciones++;
    }
  }
  assert.equal(funciones, 21);
  console.log('Controladores CRM OK:', JSON.stringify({ archivos:4, funciones, modelos:30 }));
  console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
} catch (error) {
  console.error('Verificación fallida:', error.message);
  process.exitCode = 1;
} finally { await db.close(); }
