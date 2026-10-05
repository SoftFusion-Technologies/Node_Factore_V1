/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas cursoLecciones de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_CursoLecciones_CTS, OBRS_DetCursoLeccion_CTS, CR_CursoLeccion_CTS, UR_CursoLeccion_CTS, ER_CursoLeccion_CTS, ER_VideoLeccion_CTS } from '../Controllers/Curso/CTS_TB_CursoLecciones.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/cursos/:curso_id/lecciones', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_CursoLecciones_CTS);
router.get('/api/admin/cursos/:curso_id/lecciones/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetCursoLeccion_CTS);
router.post('/api/admin/cursos/:curso_id/lecciones', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_CursoLeccion_CTS);
router.patch('/api/admin/cursos/:curso_id/lecciones/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_CursoLeccion_CTS);
router.delete('/api/admin/cursos/:curso_id/lecciones/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_CursoLeccion_CTS);
router.delete('/api/admin/cursos/:curso_id/lecciones/:id/video', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_VideoLeccion_CTS);

export default router;
