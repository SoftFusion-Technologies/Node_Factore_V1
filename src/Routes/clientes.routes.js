/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas clientes de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_Clientes_CTS, OBRS_DetCliente_CTS, CR_Cliente_CTS, UR_Cliente_CTS, ER_Cliente_CTS } from '../Controllers/Cliente/CTS_TB_Clientes.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/clientes', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_Clientes_CTS);
router.get('/api/admin/clientes/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetCliente_CTS);
router.post('/api/admin/clientes', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_Cliente_CTS);
router.patch('/api/admin/clientes/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_Cliente_CTS);
router.delete('/api/admin/clientes/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_Cliente_CTS);

export default router;
