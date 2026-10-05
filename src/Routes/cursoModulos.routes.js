/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas cursoModulos de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_CursoModulos_CTS, OBRS_DetCursoModulo_CTS, CR_CursoModulo_CTS, UR_CursoModulo_CTS, ER_CursoModulo_CTS } from '../Controllers/Curso/CTS_TB_CursoModulos.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/cursos/:curso_id/modulos', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_CursoModulos_CTS);
router.get('/api/admin/cursos/:curso_id/modulos/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetCursoModulo_CTS);
router.post('/api/admin/cursos/:curso_id/modulos', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_CursoModulo_CTS);
router.patch('/api/admin/cursos/:curso_id/modulos/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_CursoModulo_CTS);
router.delete('/api/admin/cursos/:curso_id/modulos/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_CursoModulo_CTS);

export default router;
