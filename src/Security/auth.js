/* Benjamin Orellana - 05/10/2026 - Middleware para las próximas rutas. */
import { sesionActual,cargarSesion } from '../Services/Usuario/auth.service.js';
import { verificarOrigen,leerCookie,cookieSesion } from '../Services/Usuario/configAuth.service.js';
import { exigir } from '../utils/validacion.utils.js';
import { responderError } from '../utils/http.utils.js';
function middleware(operation) {
  return async(req,res,next)=>{
    try {await operation(req,res);return next();}
    catch(error){if(error.status===401) cookieSesion(res);return responderError(error,res);}
  };
}
export const autenticar=middleware(req=>sesionActual(req));
export const protegerOrigen=middleware(req=>verificarOrigen(req));
export const exigirPasswordActualizada=middleware(req=>exigir(req.user&&req.user.cambiar_password===0,403,'CAMBIAR_PASSWORD','Cambiar la contraseña para continuar.'));
export const soloAdmin=middleware(req=>exigir(req.user?.rol==='ADMIN',403,'NO_AUTORIZADO','Se requiere administrador.'));
export const soloAlumno=middleware(req=>exigir(req.user?.rol==='ALUMNO',403,'NO_AUTORIZADO','Esta sección corresponde al alumno.'));
export async function sesionVigente(req) {
  const session=await cargarSesion(leerCookie(req));return Boolean(session&&session.usuario.cambiar_password===0);
}
