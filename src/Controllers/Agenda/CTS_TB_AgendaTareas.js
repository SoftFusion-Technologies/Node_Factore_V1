/* Benjamin Orellana - 20/10/2026 - Operaciones de tareas personales de Agenda. */
import { controladorAgenda } from '../../Services/Agenda/agendaAcceso.service.js';
import { crearTareaAgenda, guardarTareaAgenda, eliminarTareaAgenda, recordarTareaAgenda } from '../../Services/Agenda/agendaContenido.service.js';

export const CR_AgendaTarea_CTS = controladorAgenda('POST', async (req, ctx) => ({ status: 201, data: await crearTareaAgenda(req, ctx) }));
export const UR_AgendaTarea_CTS = controladorAgenda('PATCH', async (req, ctx) => ({ data: await guardarTareaAgenda(req, ctx) }));
export const ER_AgendaTarea_CTS = controladorAgenda('DELETE', async (req, ctx) => ({ data: await eliminarTareaAgenda(req, ctx) }));
export const RECORDAR_AgendaTarea_CTS = controladorAgenda('POST', async (req, ctx) => ({ data: await recordarTareaAgenda(req, ctx) }));
