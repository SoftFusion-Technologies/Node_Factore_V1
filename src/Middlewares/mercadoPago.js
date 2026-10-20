/* Benjamin Orellana - 13/10/2026 - Firma antes de leer JSON o consultar al proveedor. */
import { verificarFirmaWebhook } from '../Services/Pago/firmaWebhook.service.js';
import { responderError } from '../utils/http.utils.js';
export function autenticarWebhookMP(req,res,next) {
  try { req.mpPagoId = verificarFirmaWebhook(req);next(); }
  catch(error) { return responderError(error,res); }
}
