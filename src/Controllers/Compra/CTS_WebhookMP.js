/* Benjamin Orellana - 13/10/2026 - Webhook payment autenticado; no confía en status del cuerpo. */
import { confirmarPagoMP } from '../../Services/Compra/confirmacionPago.service.js';
import { exigir,id } from '../../utils/validacion.utils.js';
import { responderError } from '../../utils/http.utils.js';
export async function CR_WebhookMP_CTS(req,res) {
  try {
    exigir(req.body?.type==='payment' && (req.query.type===undefined || req.query.type==='payment') &&
      ['payment.created','payment.updated'].includes(req.body.action) && id(req.body.data?.id)===req.mpPagoId,
      400,'MP_NOTIFICACION_INVALIDA','La notificación no corresponde al recurso firmado.');
    await confirmarPagoMP(req.mpPagoId);
    return res.status(200).json({ok:true});
  } catch(error) {return responderError(error,res);}
}
