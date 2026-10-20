import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import * as Accesos from '../src/Controllers/Acceso/CTS_TB_CursoAccesos.js';
import * as Lecciones from '../src/Controllers/Acceso/CTS_TB_CursoAccesoLecciones.js';
import * as Historial from '../src/Controllers/Acceso/CTS_TB_CursoAccesosHistorial.js';
import { modelos } from '../src/Models/index.js';
try {
  const modules = [[Accesos, ['OBRS_CursoAccesos_CTS', 'OBRS_DetCursoAcceso_CTS', 'CR_CursoAcceso_CTS', 'UR_CursoAcceso_CTS',
    'RENOVAR_CursoAcceso_CTS', 'SUSPENDER_CursoAcceso_CTS', 'REACTIVAR_CursoAcceso_CTS', 'ER_CursoAcceso_CTS']],
    [Lecciones, ['OBRS_CursoAccesoLecciones_CTS', 'UR_CursoAccesoLeccion_CTS', 'ER_CursoAccesoLeccion_CTS']],
    [Historial, ['OBRS_CursoAccesosHistorial_CTS']]];
  for (const [module, names] of modules) {
    assert.deepEqual(Object.keys(module).sort(), names.sort()); for (const name of names) assert.equal(typeof module[name], 'function');
  }
  assert.equal(Object.keys(modelos).length, 21);
  console.log('Controladores accesos OK: ' + JSON.stringify({ archivos: 3, funciones: 12, modelos: 21 }));
  console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
} catch (error) { console.error(error.message); process.exitCode = 1; } finally { await db.close(); }
