/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas accesos de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_CursoAccesos_CTS, OBRS_DetCursoAcceso_CTS, CR_CursoAcceso_CTS, UR_CursoAcceso_CTS, RENOVAR_CursoAcceso_CTS, SUSPENDER_CursoAcceso_CTS, REACTIVAR_CursoAcceso_CTS, ER_CursoAcceso_CTS } from '../Controllers/Acceso/CTS_TB_CursoAccesos.js';
import { OBRS_CursoAccesoLecciones_CTS, UR_CursoAccesoLeccion_CTS, ER_CursoAccesoLeccion_CTS } from '../Controllers/Acceso/CTS_TB_CursoAccesoLecciones.js';
import { OBRS_CursoAccesosHistorial_CTS } from '../Controllers/Acceso/CTS_TB_CursoAccesosHistorial.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/accesos', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_CursoAccesos_CTS);
router.get('/api/admin/accesos/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetCursoAcceso_CTS);
router.post('/api/admin/accesos', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_CursoAcceso_CTS);
router.patch('/api/admin/accesos/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_CursoAcceso_CTS);
router.post('/api/admin/accesos/:id/renovar', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, RENOVAR_CursoAcceso_CTS);
router.post('/api/admin/accesos/:id/suspender', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, SUSPENDER_CursoAcceso_CTS);
router.post('/api/admin/accesos/:id/reactivar', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, REACTIVAR_CursoAcceso_CTS);
router.delete('/api/admin/accesos/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_CursoAcceso_CTS);
router.get('/api/admin/accesos/:acceso_id/lecciones', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_CursoAccesoLecciones_CTS);
router.patch('/api/admin/accesos/:acceso_id/lecciones/:leccion_id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_CursoAccesoLeccion_CTS);
router.delete('/api/admin/accesos/:acceso_id/lecciones/:leccion_id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_CursoAccesoLeccion_CTS);
router.get('/api/admin/accesos/:acceso_id/historial', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_CursoAccesosHistorial_CTS);

export default router;
