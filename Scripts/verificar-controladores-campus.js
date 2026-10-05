import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import * as Cursos from '../src/Controllers/Campus/CTS_CampusCursos.js';
import * as Materiales from '../src/Controllers/Campus/CTS_CampusMateriales.js';
import * as Progreso from '../src/Controllers/Campus/CTS_CampusProgreso.js';
import * as Comercios from '../src/Controllers/Campus/CTS_CampusComercios.js';
import * as Archivos from '../src/Controllers/Campus/CTS_CampusArchivos.js';
import { modelos } from '../src/Models/index.js';
try {
  const modules = [[Cursos, ['OBRS_MisCursos_CTS', 'OBRS_DetMiCurso_CTS', 'OBRS_MiLeccion_CTS']],
    [Materiales, ['OBRS_MisMateriales_CTS']], [Progreso, ['OBRS_MiProgresoCurso_CTS', 'UR_MiProgresoLeccion_CTS']],
    [Comercios, ['OBRS_ComerciosCampus_CTS', 'OBRS_DetComercioCampus_CTS']],
    [Archivos, ['OBRS_VideoCampus_CTS', 'OBRS_PortadaCursoCampus_CTS', 'OBRS_PortadaLeccionCampus_CTS', 'OBRS_MaterialCampus_CTS', 'OBRS_LogoComercioCampus_CTS']]];
  for (const [module, names] of modules) {
    assert.deepEqual(Object.keys(module).sort(), names.sort()); for (const name of names) assert.equal(typeof module[name], 'function');
  }
  assert.equal(Object.keys(modelos).length, 18);
  console.log('Controladores campus OK: ' + JSON.stringify({ archivos: 5, funciones: 13, modelos: 18 }));
  console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
} catch (error) { console.error(error.message); process.exitCode = 1; } finally { await db.close(); }
