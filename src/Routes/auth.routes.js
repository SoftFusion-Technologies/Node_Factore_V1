/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas auth de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { LOGIN_CTS, OBRS_MiPerfil_CTS, LOGOUT_CTS, UR_MiPassword_CTS, ACTIVAR_Cuenta_CTS, RECUPERAR_Cuenta_CTS } from '../Controllers/Usuario/CTS_Auth.js';
import { autenticar, protegerOrigen } from '../Security/auth.js';
import { jsonAuth } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.post('/api/auth/login', protegerOrigen, jsonAuth, LOGIN_CTS);
router.get('/api/auth/me', autenticar, OBRS_MiPerfil_CTS);
router.post('/api/auth/logout', protegerOrigen, jsonAuth, LOGOUT_CTS);
router.patch('/api/auth/password', autenticar, jsonAuth, UR_MiPassword_CTS);
router.post('/api/auth/activar', protegerOrigen, jsonAuth, ACTIVAR_Cuenta_CTS);
router.post('/api/auth/recuperar', protegerOrigen, jsonAuth, RECUPERAR_Cuenta_CTS);

export default router;
