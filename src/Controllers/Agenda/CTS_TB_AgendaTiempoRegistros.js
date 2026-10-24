/* Benjamin Orellana - 20/10/2026 - Inicio, pausa y eliminación de tramos de tiempo. */
import { controladorAgenda } from '../../Services/Agenda/agendaAcceso.service.js';
import { iniciarTiempoAgenda, detenerTiempoAgenda, eliminarTiempoAgenda } from '../../Services/Agenda/agendaTiempo.service.js';

export const INICIAR_AgendaTiempo_CTS = controladorAgenda('POST', async (req, ctx) => ({ data: await iniciarTiempoAgenda(req, ctx) }));
export const DETENER_AgendaTiempo_CTS = controladorAgenda('POST', async (req, ctx) => ({ data: await detenerTiempoAgenda(req, ctx) }));
export const ER_AgendaTiempo_CTS = controladorAgenda('DELETE', async (req, ctx) => ({ data: await eliminarTiempoAgenda(req, ctx) }));
