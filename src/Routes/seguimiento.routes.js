/* Benjamin Orellana - 06/10/2026 - Seguimiento, exclusivamente de lectura administrativa. */
import express from 'express';
import { OBRS_Seguimiento_CTS, OBRS_DetSeguimiento_CTS } from '../Controllers/Seguimiento/CTS_Seguimiento.js';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
const router=express.Router({caseSensitive:true,strict:true});
router.get('/api/admin/seguimiento',autenticar,exigirPasswordActualizada,soloAdmin,OBRS_Seguimiento_CTS);
router.get('/api/admin/seguimiento/:id',autenticar,exigirPasswordActualizada,soloAdmin,OBRS_DetSeguimiento_CTS);
export default router;
