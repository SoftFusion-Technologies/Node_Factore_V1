/* Benjamin Orellana - 13/10/2026 - Checkout público: permisos por compra, no por ID libre. */
import express from 'express';
import { protegerOrigen } from '../Security/auth.js';
import { jsonAuth } from '../Middlewares/http.js';
import { tokenCompra,limitarCheckout,cookieCompra,origenNavegador } from '../Middlewares/checkout.js';
import { CR_Compra_CTS,OBRS_Compra_CTS,ER_Compra_CTS,PREPARAR_SesionCompra_CTS,OBRS_SesionCompra_CTS,CR_CompraNavegador_CTS,REGISTRAR_CuentaCompra_CTS } from '../Controllers/Compra/CTS_Compras.js';
import { CR_CheckoutMP_CTS } from '../Controllers/Compra/CTS_CheckoutMP.js';
const router=express.Router({caseSensitive:true,strict:true});
router.post('/api/checkout/compras',protegerOrigen,limitarCheckout,tokenCompra,jsonAuth,CR_Compra_CTS);
router.get('/api/checkout/compras/:referencia',protegerOrigen,limitarCheckout,tokenCompra,OBRS_Compra_CTS);
router.post('/api/checkout/compras/:referencia/cancelar',protegerOrigen,limitarCheckout,tokenCompra,jsonAuth,ER_Compra_CTS);
router.post('/api/checkout/compras/:referencia/mercadopago',protegerOrigen,limitarCheckout,tokenCompra,jsonAuth,CR_CheckoutMP_CTS);
// Benjamin Orellana - 18/10/2026 - Rutas de navegador: cookie HttpOnly y CSRF antes del cuerpo de escritura.
router.post('/api/checkout/navegador/compras/:referencia/sesion',protegerOrigen,limitarCheckout,origenNavegador,jsonAuth,PREPARAR_SesionCompra_CTS);
router.get('/api/checkout/navegador/compras/:referencia/sesion',protegerOrigen,limitarCheckout,cookieCompra,OBRS_SesionCompra_CTS);
router.post('/api/checkout/navegador/compras/:referencia',protegerOrigen,limitarCheckout,cookieCompra,jsonAuth,CR_CompraNavegador_CTS);
router.get('/api/checkout/navegador/compras/:referencia',protegerOrigen,limitarCheckout,cookieCompra,OBRS_Compra_CTS);
router.post('/api/checkout/navegador/compras/:referencia/cancelar',protegerOrigen,limitarCheckout,cookieCompra,jsonAuth,ER_Compra_CTS);
router.post('/api/checkout/navegador/compras/:referencia/mercadopago',protegerOrigen,limitarCheckout,cookieCompra,jsonAuth,CR_CheckoutMP_CTS);
router.post('/api/checkout/navegador/compras/:referencia/registrar-cuenta',protegerOrigen,limitarCheckout,cookieCompra,jsonAuth,REGISTRAR_CuentaCompra_CTS);
export default router;
