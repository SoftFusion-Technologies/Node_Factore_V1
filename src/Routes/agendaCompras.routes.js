/* Benjamin Orellana - 24/10/2026 - Compra de Agenda vinculada exclusivamente a la cuenta autenticada. */
import express from 'express';
import { autenticar, exigirPasswordActualizada } from '../Security/auth.js';
import { jsonAuth } from '../Middlewares/http.js';
import { OBRS_OfertaAgenda_CTS, CR_CompraAgenda_CTS, OBRS_CompraAgenda_CTS,
  CR_PagoAgenda_CTS, ER_CompraAgenda_CTS, APLICAR_CompraAgenda_CTS } from '../Controllers/Agenda/CTS_AgendaCompras.js';

const router = express.Router({ caseSensitive: true, strict: true });
router.get('/api/agenda/venta', autenticar, exigirPasswordActualizada, OBRS_OfertaAgenda_CTS);
router.post('/api/agenda/compras', autenticar, exigirPasswordActualizada, jsonAuth, CR_CompraAgenda_CTS);
router.get('/api/agenda/compras/:referencia', autenticar, exigirPasswordActualizada, OBRS_CompraAgenda_CTS);
router.post('/api/agenda/compras/:referencia/mercadopago', autenticar, exigirPasswordActualizada, jsonAuth, CR_PagoAgenda_CTS);
router.post('/api/agenda/compras/:referencia/cancelar', autenticar, exigirPasswordActualizada, jsonAuth, ER_CompraAgenda_CTS);
router.post('/api/agenda/compras/:referencia/aplicar', autenticar, exigirPasswordActualizada, jsonAuth, APLICAR_CompraAgenda_CTS);
export default router;
