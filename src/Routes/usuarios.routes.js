/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas usuarios de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_Usuarios_CTS, OBRS_DetUsuario_CTS, CR_Usuario_CTS, UR_Usuario_CTS, ER_Usuario_CTS, CR_ActivacionUsuario_CTS, CR_RecuperacionUsuario_CTS, ER_SesionesUsuario_CTS } from '../Controllers/Usuario/CTS_TB_Usuarios.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/usuarios', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_Usuarios_CTS);
router.get('/api/admin/usuarios/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetUsuario_CTS);
router.post('/api/admin/usuarios', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_Usuario_CTS);
router.patch('/api/admin/usuarios/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_Usuario_CTS);
router.delete('/api/admin/usuarios/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_Usuario_CTS);
router.post('/api/admin/usuarios/:id/activacion', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_ActivacionUsuario_CTS);
router.post('/api/admin/usuarios/:id/recuperacion', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_RecuperacionUsuario_CTS);
router.delete('/api/admin/usuarios/:id/sesiones', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_SesionesUsuario_CTS);

export default router;
