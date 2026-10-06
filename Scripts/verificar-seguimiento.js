/* Benjamin Orellana - 06/10/2026 - Verificación de seguimiento sin conectar a MySQL. */
import assert from 'node:assert/strict';
import * as controllers from '../src/Controllers/Seguimiento/CTS_Seguimiento.js';
import routes from '../src/Routes/seguimiento.routes.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../src/Security/auth.js';
import db from '../src/DataBase/db.js';
try {
 const entries=Object.values(controllers);assert.equal(entries.length,2);
 assert.equal(routes.stack.length,2);
 for(const layer of routes.stack){assert.deepEqual(Object.keys(layer.route.methods),['get']);assert.deepEqual(layer.route.stack.slice(0,3).map(h=>h.handle),[autenticar,exigirPasswordActualizada,soloAdmin]);assert.ok(entries.includes(layer.route.stack.at(-1).handle));}
 console.log('Seguimiento OK: '+JSON.stringify({controladores:1,funciones:2,rutas:2}));
 console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.close();}
