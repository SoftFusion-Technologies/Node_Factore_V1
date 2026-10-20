/* Benjamin Orellana - 13/10/2026 - Servidor a servidor, autenticación HMAC. */
import express from 'express';
import { autenticarWebhookMP } from '../Middlewares/mercadoPago.js';
import { jsonAuth } from '../Middlewares/http.js';
import { CR_WebhookMP_CTS } from '../Controllers/Compra/CTS_WebhookMP.js';
const router=express.Router({caseSensitive:true,strict:true});
router.post('/api/mercadopago/webhook',autenticarWebhookMP,jsonAuth,CR_WebhookMP_CTS);
export default router;
