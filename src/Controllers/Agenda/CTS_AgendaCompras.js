/* Benjamin Orellana - 24/10/2026 - Compras propias de Agenda con sesión, CSRF y precio del servidor. */
import { camposPermitidos } from '../../utils/validacion.utils.js';
import { controladorAgenda } from '../../Services/Agenda/agendaAcceso.service.js';
import { ofertaAgenda, crearCompraAgenda, resumenCompraAgenda, validarPagoAgenda,
  cancelarCompraAgenda, entregarAgendaCompra } from '../../Services/Agenda/agendaCompra.service.js';
import { crearCheckoutAgenda } from '../../Services/Compra/checkout.service.js';

const opciones = { permiso: false };
export const OBRS_OfertaAgenda_CTS = controladorAgenda('GET', async (req, ctx) => ({ data: await ofertaAgenda(req, ctx) }), opciones);
export const CR_CompraAgenda_CTS = controladorAgenda('POST', async (req, ctx) => ({ data: await crearCompraAgenda(req, ctx) }), opciones);
export const OBRS_CompraAgenda_CTS = controladorAgenda('GET', async (req, ctx) => ({ data: await resumenCompraAgenda(req, ctx) }), opciones);
export const CR_PagoAgenda_CTS = controladorAgenda('POST', async (req, ctx) => ({ data: await validarPagoAgenda(req, ctx) }), {
  ...opciones, despues: async (result, req) => ({ data: await crearCheckoutAgenda(result.data.referencia, req) })
});
export const ER_CompraAgenda_CTS = controladorAgenda('POST', async (req, ctx) => ({ data: await cancelarCompraAgenda(req, ctx) }), opciones);
export const APLICAR_CompraAgenda_CTS = controladorAgenda('POST', async (req, ctx) => ({ data: await validarEntrega(req, ctx) }), {
  ...opciones, despues: async result => {
    await entregarAgendaCompra(result.data.referencia);
    return { data: { actualizada: true } };
  }
});
async function validarEntrega(req, ctx) {
  // Consultar la compra propia antes de invocar la entrega; el cuerpo vacío se valida también.
  camposPermitidos(req.body, [], { vacio: true });
  return resumenCompraAgenda(req, ctx);
}
