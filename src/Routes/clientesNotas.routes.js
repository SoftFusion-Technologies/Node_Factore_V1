/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas clientesNotas de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_ClientesNotas_CTS, OBRS_DetClienteNota_CTS, CR_ClienteNota_CTS, UR_ClienteNota_CTS, ER_ClienteNota_CTS } from '../Controllers/Cliente/CTS_TB_ClientesNotas.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/clientes/:cliente_id/notas', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_ClientesNotas_CTS);
router.get('/api/admin/clientes/:cliente_id/notas/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetClienteNota_CTS);
router.post('/api/admin/clientes/:cliente_id/notas', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_ClienteNota_CTS);
router.patch('/api/admin/clientes/:cliente_id/notas/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_ClienteNota_CTS);
router.delete('/api/admin/clientes/:cliente_id/notas/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_ClienteNota_CTS);

export default router;
