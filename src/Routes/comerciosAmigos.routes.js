/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas comerciosAmigos de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_ComerciosAmigos_CTS, OBRS_DetComercioAmigo_CTS, CR_ComercioAmigo_CTS, UR_ComercioAmigo_CTS, ER_ComercioAmigo_CTS } from '../Controllers/Comercio/CTS_TB_ComerciosAmigos.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/comercios', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_ComerciosAmigos_CTS);
router.get('/api/admin/comercios/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetComercioAmigo_CTS);
router.post('/api/admin/comercios', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_ComercioAmigo_CTS);
router.patch('/api/admin/comercios/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_ComercioAmigo_CTS);
router.delete('/api/admin/comercios/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_ComercioAmigo_CTS);

export default router;
