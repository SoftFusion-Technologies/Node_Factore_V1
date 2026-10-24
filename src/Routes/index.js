/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
import agendaComprasRoutes from './agendaCompras.routes.js';
import mercadoPagoRoutes from './mercadoPago.routes.js';
import checkoutRoutes from './checkout.routes.js';
/* Benjamin Orellana - 05/10/2026 - Orquestador de rutas de Factor E. */
import express from 'express';
import healthRoutes from './health.routes.js';
import clientesRoutes from './clientes.routes.js';
import clientesNotasRoutes from './clientesNotas.routes.js';
import comerciosAmigosRoutes from './comerciosAmigos.routes.js';
import comercioClientesRoutes from './comercioClientes.routes.js';
import cursosRoutes from './cursos.routes.js';
import cursoModulosRoutes from './cursoModulos.routes.js';
import cursoLeccionesRoutes from './cursoLecciones.routes.js';
import cursoMaterialesRoutes from './cursoMateriales.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import authRoutes from './auth.routes.js';
import archivosRoutes from './archivos.routes.js';
import accesosRoutes from './accesos.routes.js';
import seguimientoRoutes from './seguimiento.routes.js';
import campusRoutes from './campus.routes.js';
import catalogoRoutes from './catalogo.routes.js';
// Benjamin Orellana - 19/10/2026 - Consultas privadas de compras.
import comprasRoutes from './compras.routes.js';
// Benjamin Orellana - 21/10/2026 - Incorporar las rutas de Mi agenda.
// Benjamin Orellana - 22/10/2026 - Configuración comercial administrativa.
import agendaVentaRoutes from './agendaVenta.routes.js';
import agendaRoutes from './agenda.routes.js';

const router = express.Router({ caseSensitive: true, strict: true });
router.use(healthRoutes);
router.use(clientesRoutes);
router.use(clientesNotasRoutes);
router.use(comerciosAmigosRoutes);
router.use(comercioClientesRoutes);
router.use(cursosRoutes);
router.use(cursoModulosRoutes);
router.use(cursoLeccionesRoutes);
router.use(cursoMaterialesRoutes);
router.use(usuariosRoutes);
router.use(authRoutes);
router.use(archivosRoutes);
router.use(accesosRoutes);
router.use(campusRoutes);
router.use(seguimientoRoutes);
router.use(catalogoRoutes);
router.use(checkoutRoutes);
router.use(mercadoPagoRoutes);
router.use(comprasRoutes);
router.use(agendaRoutes);
router.use(agendaVentaRoutes);
router.use(agendaComprasRoutes);

export default router;
