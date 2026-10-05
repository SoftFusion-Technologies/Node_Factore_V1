/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas cursoMateriales de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_CursoMateriales_CTS, OBRS_DetCursoMaterial_CTS, CR_CursoMaterial_CTS, UR_CursoMaterial_CTS, ER_CursoMaterial_CTS } from '../Controllers/Curso/CTS_TB_CursoMateriales.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/cursos/:curso_id/materiales', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_CursoMateriales_CTS);
router.get('/api/admin/cursos/:curso_id/materiales/:id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_DetCursoMaterial_CTS);
router.post('/api/admin/cursos/:curso_id/materiales', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_CursoMaterial_CTS);
router.patch('/api/admin/cursos/:curso_id/materiales/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_CursoMaterial_CTS);
router.delete('/api/admin/cursos/:curso_id/materiales/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_CursoMaterial_CTS);

export default router;
