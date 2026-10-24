/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 22/10/2026 - Catálogo actualizado con la configuración comercial de Agenda. */
/* Benjamin Orellana - 20/10/2026 - Verificación compatible con modelos de Agenda. */
/* Verificación de importaciones. No conecta a MySQL ni modifica su esquema. */
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
const expected = {
  CTS_TB_Cursos:['OBRS_Cursos_CTS','OBRS_DetCurso_CTS','CR_Curso_CTS','UR_Curso_CTS','ER_Curso_CTS'],
  CTS_TB_CursoModulos:['OBRS_CursoModulos_CTS','OBRS_DetCursoModulo_CTS','CR_CursoModulo_CTS','UR_CursoModulo_CTS','ER_CursoModulo_CTS'],
  CTS_TB_CursoLecciones:['OBRS_CursoLecciones_CTS','OBRS_DetCursoLeccion_CTS','CR_CursoLeccion_CTS','UR_CursoLeccion_CTS','ER_CursoLeccion_CTS','ER_VideoLeccion_CTS'],
  CTS_TB_CursoMateriales:['OBRS_CursoMateriales_CTS','OBRS_DetCursoMaterial_CTS','CR_CursoMaterial_CTS','UR_CursoMaterial_CTS','ER_CursoMaterial_CTS']
};
try {
  for (const [file,names] of Object.entries(expected)) {
    const module = await import(`../src/Controllers/Curso/${file}.js`);
    assert.deepEqual(Object.keys(module).sort(),[...names].sort());
    for (const name of names) assert.equal(typeof module[name],'function',name);
  }
  assert.equal(Object.keys(modelos).length,29);
  console.log('Controladores cursos OK: '+JSON.stringify({archivos:4,funciones:21,modelos:29}));
  console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.close(); }
