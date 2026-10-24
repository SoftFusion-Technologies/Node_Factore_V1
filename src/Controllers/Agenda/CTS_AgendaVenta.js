/* Benjamin Orellana - 22/10/2026 - Configuración comercial de Agenda exclusiva para ADMIN. */
import { controladorAgenda } from '../../Services/Agenda/agendaAcceso.service.js';
import { obtenerVentaAgenda, guardarVentaAgenda } from '../../Services/Agenda/agendaVenta.service.js';

export const OBRS_AgendaVenta_CTS = controladorAgenda('GET', async (req, ctx) => ({
  data: await obtenerVentaAgenda(req, ctx)
}), { admin: true });

export const UR_AgendaVenta_CTS = controladorAgenda('PATCH', async (req, ctx) => ({
  message: 'Configuración de Mi agenda guardada.', data: await guardarVentaAgenda(req, ctx)
}), { admin: true });
