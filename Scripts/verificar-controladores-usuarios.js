/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 22/10/2026 - Catálogo actualizado con la configuración comercial de Agenda. */
/* Benjamin Orellana - 20/10/2026 - Verificación compatible con modelos de Agenda. */
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import * as Usuarios from '../src/Controllers/Usuario/CTS_TB_Usuarios.js';
import * as Auth from '../src/Controllers/Usuario/CTS_Auth.js';
import * as Security from '../src/Security/auth.js';
import { modelos } from '../src/Models/index.js';
try {
  const expectedUsuarios=['OBRS_Usuarios_CTS','OBRS_DetUsuario_CTS','CR_Usuario_CTS','UR_Usuario_CTS','ER_Usuario_CTS','CR_ActivacionUsuario_CTS','CR_RecuperacionUsuario_CTS','ER_SesionesUsuario_CTS'];
  const expectedAuth=['LOGIN_CTS','OBRS_MiPerfil_CTS','LOGOUT_CTS','UR_MiPassword_CTS','ACTIVAR_Cuenta_CTS','RECUPERAR_Cuenta_CTS'];
  const expectedSecurity=['autenticar','protegerOrigen','exigirPasswordActualizada','soloAdmin','soloAlumno','sesionVigente'];
  for(const [module,names] of [[Usuarios,expectedUsuarios],[Auth,expectedAuth],[Security,expectedSecurity]]) {
    assert.deepEqual(Object.keys(module).sort(),names.sort());for(const name of names) assert.equal(typeof module[name],'function');
  }
  assert.equal(Object.keys(modelos).length,30);
  console.log('Usuarios y autenticación OK: '+JSON.stringify({controladores:2,funciones:14,middlewares:5,modelos:30}));
  console.log('Verificación local terminada. No se abrió una conexión a MySQL.');
} catch(error) {console.error(error.message);process.exitCode=1;} finally {await db.close();}
