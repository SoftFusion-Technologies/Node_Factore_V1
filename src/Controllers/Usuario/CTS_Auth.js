/* Benjamin Orellana - 05/10/2026 - Autenticación y cuenta propia. */
import { serializar,responderError } from '../../utils/http.utils.js';
import { cookieSesion } from '../../Services/Usuario/configAuth.service.js';
import { login,logout,sesionActual,cambiarPassword,consumirToken } from '../../Services/Usuario/auth.service.js';
import { tokenCsrf } from '../../utils/password.utils.js';
function auth(operation) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try {const data=await operation(req,res);return res.status(200).json(serializar({data}));}
    catch(error){if(error.status===401) cookieSesion(res);return responderError(error,res);}
  };
}
export const LOGIN_CTS=auth(async(req,res)=>{const result=await login(req);cookieSesion(res,result.raw);return result.data;});
export const OBRS_MiPerfil_CTS=auth(async req=>{
  const session=await sesionActual(req);return {usuario:session.usuario,csrf_token:tokenCsrf(req.sessionToken),vence_en:session.vence_en};
});
export const LOGOUT_CTS=auth(async(req,res)=>{await logout(req);cookieSesion(res);return {cerrado:true};});
export const UR_MiPassword_CTS=auth(async(req,res)=>{await cambiarPassword(req);cookieSesion(res);return {actualizado:true,iniciar_sesion:true};});
export const ACTIVAR_Cuenta_CTS=auth(async(req,res)=>{await consumirToken(req,'ACTIVACION');cookieSesion(res);return {habilitado:true,iniciar_sesion:true};});
export const RECUPERAR_Cuenta_CTS=auth(async(req,res)=>{await consumirToken(req,'RECUPERACION');cookieSesion(res);return {actualizado:true,iniciar_sesion:true};});
