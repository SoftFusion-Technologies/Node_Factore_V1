/* Importaciones locales; no abre MySQL ni consulta a Mercado Pago. */
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import { reconciliarCompra,validarReferenciaReconciliacion } from '../src/Services/Compra/reconciliacionCompra.service.js';
import { buscarPreferenciaCompra,obtenerPreferenciaMP,buscarPagosCompra } from '../src/Services/Pago/busquedaMP.service.js';
try {
  for(const fn of [reconciliarCompra,buscarPreferenciaCompra,obtenerPreferenciaMP,buscarPagosCompra])assert.equal(typeof fn,'function');
  assert.equal(validarReferenciaReconciliacion('12345678-1234-4234-8234-123456789012'),'12345678-1234-4234-8234-123456789012');
  assert.throws(()=>validarReferenciaReconciliacion('../../ruta'));
  console.log('Reconciliación OK: recuperación de preferencias, búsqueda paginada y verificación individual de pagos.');
  console.log('No se abrió una conexión a MySQL ni se contactó a Mercado Pago.');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await db.close();}
