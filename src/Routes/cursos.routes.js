/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas cursos de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_Cursos_CTS, OBRS_DetCurso_CTS, CR_Curso_CTS, UR_Curso_CTS, ER_Curso_CTS } from '../Controllers/Curso/CTS_TB_Cursos.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/cursos', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_Cursos_CTS);
router.get('/api/admin/cursos/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetCurso_CTS);
router.post('/api/admin/cursos', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_Curso_CTS);
router.patch('/api/admin/cursos/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_Curso_CTS);
router.delete('/api/admin/cursos/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_Curso_CTS);

export default router;
