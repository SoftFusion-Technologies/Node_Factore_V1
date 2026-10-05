/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 05 / 10 / 2026
 * Versión: 1.0
 * Descripción: Rutas comercioClientes de Factor E; paths completos y permisos explícitos.
 * Capa: Backend
 */
import express from 'express';
import { OBRS_ClientesComercio_CTS, OBRS_ComerciosCliente_CTS, CR_ComercioCliente_CTS, UR_ComercioCliente_CTS, ER_ComercioCliente_CTS } from '../Controllers/Comercio/CTS_TB_ComercioClientes.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonGestion } from '../Middlewares/http.js';

const router = express.Router({ caseSensitive: true, strict: true });

router.get('/api/admin/comercios/:comercio_id/clientes', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_ClientesComercio_CTS);
router.get('/api/admin/clientes/:cliente_id/comercios', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_ComerciosCliente_CTS);
router.post('/api/admin/comercios/:comercio_id/clientes', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, CR_ComercioCliente_CTS);
router.patch('/api/admin/comercios/:comercio_id/clientes/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, UR_ComercioCliente_CTS);
router.delete('/api/admin/comercios/:comercio_id/clientes/:id', autenticar, exigirPasswordActualizada, soloAdmin, jsonGestion, ER_ComercioCliente_CTS);

export default router;
