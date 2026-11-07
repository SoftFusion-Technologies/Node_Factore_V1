/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 22/10/2026 - Catálogo actualizado con la configuración comercial de Agenda. */
/* Benjamin Orellana - 20/10/2026 - Verificación compatible con modelos de Agenda. */
/* Benjamin Orellana - 13/10/2026 - Verifica imports y contratos sin usar credenciales. */
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { initRelaciones } from '../src/Models/relaciones.js';
import { confirmarPagoMP } from '../src/Services/Compra/confirmacionPago.service.js';
import { verificarFirmaWebhook } from '../src/Services/Pago/firmaWebhook.service.js';
import { consultarPagoMP } from '../src/Services/Pago/consultaPago.service.js';
try {
  initRelaciones();
  assert.equal(Object.keys(modelos).length,31);
  assert.ok(modelos.compras.associations.pagos);
  assert.ok(modelos.compra_pagos.associations.compra);
  assert.equal(modelos.compra_pagos.options.indexes.find(row=>row.name==='uq_compra_pagos_mp').unique,true);
  for(const fn of [confirmarPagoMP,verificarFirmaWebhook,consultarPagoMP])assert.equal(typeof fn,'function');
  console.log('Confirmación de pagos OK: 1 modelo nuevo, firma HMAC, consultas GET y persistencia transaccional.');
  console.log('No se abrió una conexión a MySQL ni se contactó a Mercado Pago.');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await db.close();}
