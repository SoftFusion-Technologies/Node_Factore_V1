/* Benjamin Orellana - 20/10/2026 - Estado personal, calendario, pilares y preferencias de Agenda. */
import { camposPermitidos } from '../../utils/validacion.utils.js';
import { controladorAgenda, vistaAcceso } from '../../Services/Agenda/agendaAcceso.service.js';
import { obtenerDiaAgenda, obtenerMesAgenda, guardarDiaAgenda, guardarPreferenciasAgenda } from '../../Services/Agenda/agendaDia.service.js';

export const OBRS_EstadoMiAgenda_CTS = controladorAgenda('GET', async (req, ctx) => {
  camposPermitidos(req.query, [], { vacio: true });
  return { data: vistaAcceso(ctx.acceso, ctx.ahora) };
}, { permiso: false });
export const OBRS_MiAgendaMes_CTS = controladorAgenda('GET', async (req, ctx) => ({ data: await obtenerMesAgenda(req, ctx) }));
export const OBRS_MiAgendaDia_CTS = controladorAgenda('GET', async (req, ctx) => ({ data: await obtenerDiaAgenda(req, ctx) }));
export const UR_MiAgendaDia_CTS = controladorAgenda('PATCH', async (req, ctx) => ({ message: 'Día guardado.', data: await guardarDiaAgenda(req, ctx) }));
export const UR_MisPreferenciasAgenda_CTS = controladorAgenda('PATCH', async (req, ctx) => ({ data: await guardarPreferenciasAgenda(req, ctx) }));
