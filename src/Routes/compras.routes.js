/* Benjamin Orellana - 19/10/2026 - Compras de solo lectura con sesión administrativa. */
import express from 'express';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { OBRS_Compras_CTS, OBRS_DetCompra_CTS } from '../Controllers/Compra/CTS_TB_Compras.js';

const router = express.Router({ caseSensitive: true, strict: true });
router.get('/api/admin/compras', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_Compras_CTS);
router.get('/api/admin/compras/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetCompra_CTS);
export default router;
