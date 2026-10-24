/* Benjamin Orellana - 20/10/2026 - Notas personales y reordenamiento con control de versiones. */
import { controladorAgenda } from '../../Services/Agenda/agendaAcceso.service.js';
import { crearNotaAgenda, guardarNotaAgenda, eliminarNotaAgenda, ordenarNotasAgenda } from '../../Services/Agenda/agendaContenido.service.js';

export const CR_AgendaNota_CTS = controladorAgenda('POST', async (req, ctx) => ({ status: 201, data: await crearNotaAgenda(req, ctx) }));
export const UR_AgendaNota_CTS = controladorAgenda('PATCH', async (req, ctx) => ({ data: await guardarNotaAgenda(req, ctx) }));
export const ER_AgendaNota_CTS = controladorAgenda('DELETE', async (req, ctx) => ({ data: await eliminarNotaAgenda(req, ctx) }));
export const ORDENAR_AgendaNotas_CTS = controladorAgenda('PATCH', async (req, ctx) => ({ data: await ordenarNotasAgenda(req, ctx) }));
