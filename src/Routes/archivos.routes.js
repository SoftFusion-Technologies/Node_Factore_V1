/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas archivos de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_Archivos_CTS, OBRS_DetArchivo_CTS, OBRS_ReferenciasArchivo_CTS, CR_Archivo_CTS, UR_DuracionArchivo_CTS, ER_Archivo_CTS, OBRS_ContenidoArchivo_CTS } from '../Controllers/Archivo/CTS_TB_Archivos.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/archivos', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_Archivos_CTS);
router.get('/api/admin/archivos/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetArchivo_CTS);
router.get('/api/admin/archivos/:id/referencias', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_ReferenciasArchivo_CTS);
router.post('/api/admin/archivos/subir/:tipo', autenticar, exigirPasswordActualizada, soloAdmin, CR_Archivo_CTS);
router.patch('/api/admin/archivos/:id/duracion', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_DuracionArchivo_CTS);
router.delete('/api/admin/archivos/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_Archivo_CTS);
router.head('/api/admin/archivos/:id/contenido', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_ContenidoArchivo_CTS);
router.get('/api/admin/archivos/:id/contenido', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_ContenidoArchivo_CTS);

export default router;
