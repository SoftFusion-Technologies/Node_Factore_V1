/* Benjamin Orellana - 30/10/2026 - Certificados privados del alumno, emisión con CSRF y descarga sin IDs libres. */
import { OBRS_MiCertificado_CTS, CR_MiCertificado_CTS, OBRS_PdfMiCertificado_CTS } from '../Controllers/Certificado/CTS_CampusCertificados.js';
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas campus de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_MisCursos_CTS, OBRS_DetMiCurso_CTS, OBRS_MiLeccion_CTS } from '../Controllers/Campus/CTS_CampusCursos.js';
import { OBRS_MisMateriales_CTS } from '../Controllers/Campus/CTS_CampusMateriales.js';
import { OBRS_MiProgresoCurso_CTS, UR_MiProgresoLeccion_CTS } from '../Controllers/Campus/CTS_CampusProgreso.js';
import { OBRS_ComerciosCampus_CTS, OBRS_DetComercioCampus_CTS } from '../Controllers/Campus/CTS_CampusComercios.js';
import { OBRS_VideoCampus_CTS, OBRS_PortadaCursoCampus_CTS, OBRS_PortadaLeccionCampus_CTS, OBRS_MaterialCampus_CTS, OBRS_LogoComercioCampus_CTS } from '../Controllers/Campus/CTS_CampusArchivos.js';
import { autenticar, exigirPasswordActualizada, soloAlumno } from '../Security/auth.js';
import { jsonCampus } from '../Middlewares/http.js';
import { VINCULAR_Compra_CTS } from '../Controllers/Compra/CTS_Compras.js';
import { limitarCheckout } from '../Middlewares/checkout.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.post('/api/campus/compras/:referencia/vincular', autenticar, exigirPasswordActualizada, soloAlumno, limitarCheckout, jsonCampus, VINCULAR_Compra_CTS);

router.get('/api/campus/cursos/:curso_id/certificado', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_MiCertificado_CTS);
router.post('/api/campus/cursos/:curso_id/certificado', autenticar, exigirPasswordActualizada, soloAlumno, jsonCampus, CR_MiCertificado_CTS);
router.head('/api/campus/cursos/:curso_id/certificado/pdf', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_PdfMiCertificado_CTS);
router.get('/api/campus/cursos/:curso_id/certificado/pdf', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_PdfMiCertificado_CTS);

router.get('/api/campus/cursos', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_MisCursos_CTS);
router.get('/api/campus/cursos/:curso_id', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_DetMiCurso_CTS);
router.get('/api/campus/cursos/:curso_id/lecciones/:leccion_id', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_MiLeccion_CTS);
router.get('/api/campus/cursos/:curso_id/materiales', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_MisMateriales_CTS);
router.get('/api/campus/cursos/:curso_id/progreso', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_MiProgresoCurso_CTS);
router.patch('/api/campus/cursos/:curso_id/lecciones/:leccion_id/progreso', autenticar, exigirPasswordActualizada, soloAlumno, jsonCampus, UR_MiProgresoLeccion_CTS);
router.get('/api/campus/comercios', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_ComerciosCampus_CTS);
router.get('/api/campus/comercios/:comercio_id', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_DetComercioCampus_CTS);
router.head('/api/campus/cursos/:curso_id/lecciones/:leccion_id/video', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_VideoCampus_CTS);
router.get('/api/campus/cursos/:curso_id/lecciones/:leccion_id/video', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_VideoCampus_CTS);
router.head('/api/campus/cursos/:curso_id/portada', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_PortadaCursoCampus_CTS);
router.get('/api/campus/cursos/:curso_id/portada', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_PortadaCursoCampus_CTS);
router.head('/api/campus/cursos/:curso_id/lecciones/:leccion_id/portada', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_PortadaLeccionCampus_CTS);
router.get('/api/campus/cursos/:curso_id/lecciones/:leccion_id/portada', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_PortadaLeccionCampus_CTS);
router.head('/api/campus/cursos/:curso_id/materiales/:material_id/contenido', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_MaterialCampus_CTS);
router.get('/api/campus/cursos/:curso_id/materiales/:material_id/contenido', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_MaterialCampus_CTS);
router.head('/api/campus/comercios/:comercio_id/logo', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_LogoComercioCampus_CTS);
router.get('/api/campus/comercios/:comercio_id/logo', autenticar, exigirPasswordActualizada, soloAlumno, OBRS_LogoComercioCampus_CTS);

export default router;
