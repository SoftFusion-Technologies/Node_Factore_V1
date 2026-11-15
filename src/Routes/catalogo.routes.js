/* Benjamin Orellana - 13/10/2026 - Consultas públicas del catálogo comercial. */
import express from 'express';
import { protegerOrigen } from '../Security/auth.js';
import { OBRS_CatalogoCursos_CTS, OBRS_CatalogoCurso_CTS, OBRS_PortadaCatalogoCurso_CTS } from '../Controllers/Catalogo/CTS_CatalogoCursos.js';

const router = express.Router({ caseSensitive: true, strict: true });
router.get('/api/catalogo/cursos', protegerOrigen, OBRS_CatalogoCursos_CTS);
router.get('/api/catalogo/cursos/:slug', protegerOrigen, OBRS_CatalogoCurso_CTS);
// Benjamin Orellana - 15/11/2026 - Portada pública por slug, sin acceso por ID de archivo.
router.get('/api/catalogo/cursos/:slug/portada', protegerOrigen, OBRS_PortadaCatalogoCurso_CTS);

export default router;
