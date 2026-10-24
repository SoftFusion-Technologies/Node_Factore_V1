/* Benjamin Orellana - 20/10/2026 - Gestión administrativa explícita de permisos de Agenda. */
import { controladorAgenda, obtenerAccesoAgenda, guardarAccesoAgenda } from '../../Services/Agenda/agendaAcceso.service.js';

export const OBRS_AgendaAccesoUsuario_CTS = controladorAgenda('GET', async (req, ctx) => ({ data: await obtenerAccesoAgenda(req, ctx) }), { admin: true });
export const UR_AgendaAccesoUsuario_CTS = controladorAgenda('PATCH', async (req, ctx) => ({ message: 'Permiso de Agenda actualizado.', data: await guardarAccesoAgenda(req, ctx) }), { admin: true });
