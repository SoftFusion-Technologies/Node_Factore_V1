/* Benjamin Orellana - 22/10/2026 - Precio y duración de Agenda con sesión ADMIN y CSRF. */
import express from 'express';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';
import { OBRS_AgendaVenta_CTS, UR_AgendaVenta_CTS } from '../Controllers/Agenda/CTS_AgendaVenta.js';

const router = express.Router({ caseSensitive: true, strict: true });
router.get('/api/admin/agenda/venta', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_AgendaVenta_CTS);
router.patch('/api/admin/agenda/venta', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_AgendaVenta_CTS);
export default router;
