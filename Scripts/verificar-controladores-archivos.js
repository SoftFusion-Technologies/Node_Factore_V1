import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import * as Archivos from '../src/Controllers/Archivo/CTS_TB_Archivos.js';
import { modelos } from '../src/Models/index.js';
try {
  const expected=['OBRS_Archivos_CTS','OBRS_DetArchivo_CTS','OBRS_ReferenciasArchivo_CTS','CR_Archivo_CTS','UR_DuracionArchivo_CTS','ER_Archivo_CTS','OBRS_ContenidoArchivo_CTS'];
  assert.deepEqual(Object.keys(Archivos).sort(),expected.sort());
  for(const name of expected) assert.equal(typeof Archivos[name],'function');
  assert.equal(Object.keys(modelos).length,21);
  console.log('Controladores archivos OK: '+JSON.stringify({archivos:1,funciones:7,modelos:21}));
  console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
} catch(error) {console.error(error.message);process.exitCode=1;} finally {await db.close();}
