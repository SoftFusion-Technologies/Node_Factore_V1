/* Benjamin Orellana - 21/10/2026 - Rutas de Mi agenda y permisos administrativos individuales. */
import express from 'express';
import { autenticar, exigirPasswordActualizada, soloAdmin } from '../Security/auth.js';
import { jsonAgenda } from '../Middlewares/http.js';
import { OBRS_EstadoMiAgenda_CTS, OBRS_MiAgendaMes_CTS, OBRS_MiAgendaDia_CTS,
  UR_MiAgendaDia_CTS, UR_MisPreferenciasAgenda_CTS } from '../Controllers/Agenda/CTS_Agenda.js';
import { OBRS_AgendaAccesoUsuario_CTS, UR_AgendaAccesoUsuario_CTS } from '../Controllers/Agenda/CTS_TB_AgendaAccesos.js';
import { CR_AgendaTarea_CTS, UR_AgendaTarea_CTS, ER_AgendaTarea_CTS, RECORDAR_AgendaTarea_CTS } from '../Controllers/Agenda/CTS_TB_AgendaTareas.js';
import { CR_AgendaNota_CTS, UR_AgendaNota_CTS, ER_AgendaNota_CTS, ORDENAR_AgendaNotas_CTS } from '../Controllers/Agenda/CTS_TB_AgendaNotas.js';
import { INICIAR_AgendaTiempo_CTS, DETENER_AgendaTiempo_CTS, ER_AgendaTiempo_CTS } from '../Controllers/Agenda/CTS_TB_AgendaTiempoRegistros.js';

const router = express.Router({ caseSensitive: true, strict: true });

// El controlador exige un permiso personal vigente, también si la cuenta es ADMIN.
router.get('/api/agenda/estado', autenticar, exigirPasswordActualizada, OBRS_EstadoMiAgenda_CTS);
router.get('/api/agenda/mes', autenticar, exigirPasswordActualizada, OBRS_MiAgendaMes_CTS);
router.get('/api/agenda/dias/:fecha', autenticar, exigirPasswordActualizada, OBRS_MiAgendaDia_CTS);
router.patch('/api/agenda/dias/:fecha', autenticar, exigirPasswordActualizada, jsonAgenda, UR_MiAgendaDia_CTS);
router.patch('/api/agenda/preferencias', autenticar, exigirPasswordActualizada, jsonAgenda, UR_MisPreferenciasAgenda_CTS);

router.post('/api/agenda/dias/:fecha/tareas', autenticar, exigirPasswordActualizada, jsonAgenda, CR_AgendaTarea_CTS);
router.patch('/api/agenda/tareas/:id', autenticar, exigirPasswordActualizada, jsonAgenda, UR_AgendaTarea_CTS);
router.delete('/api/agenda/tareas/:id', autenticar, exigirPasswordActualizada, jsonAgenda, ER_AgendaTarea_CTS);
router.post('/api/agenda/tareas/:id/recordar', autenticar, exigirPasswordActualizada, jsonAgenda, RECORDAR_AgendaTarea_CTS);

router.post('/api/agenda/dias/:fecha/notas', autenticar, exigirPasswordActualizada, jsonAgenda, CR_AgendaNota_CTS);
router.patch('/api/agenda/notas/:id', autenticar, exigirPasswordActualizada, jsonAgenda, UR_AgendaNota_CTS);
router.delete('/api/agenda/notas/:id', autenticar, exigirPasswordActualizada, jsonAgenda, ER_AgendaNota_CTS);
router.patch('/api/agenda/dias/:fecha/notas/orden', autenticar, exigirPasswordActualizada, jsonAgenda, ORDENAR_AgendaNotas_CTS);

router.post('/api/agenda/tiempos', autenticar, exigirPasswordActualizada, jsonAgenda, INICIAR_AgendaTiempo_CTS);
router.post('/api/agenda/tiempos/:id/detener', autenticar, exigirPasswordActualizada, jsonAgenda, DETENER_AgendaTiempo_CTS);
router.delete('/api/agenda/tiempos/:id', autenticar, exigirPasswordActualizada, jsonAgenda, ER_AgendaTiempo_CTS);

router.get('/api/admin/agenda/accesos/:usuario_id', autenticar, exigirPasswordActualizada, soloAdmin, OBRS_AgendaAccesoUsuario_CTS);
router.patch('/api/admin/agenda/accesos/:usuario_id', autenticar, exigirPasswordActualizada, soloAdmin, jsonAgenda, UR_AgendaAccesoUsuario_CTS);

export default router;
