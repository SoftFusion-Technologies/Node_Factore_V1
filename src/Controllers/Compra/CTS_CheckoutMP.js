/* Benjamin Orellana - 13/10/2026 - Creación de preferencia, no confirmación del pago. */
import { crearCheckout } from '../../Services/Compra/checkout.service.js';
import { camposPermitidos } from '../../utils/validacion.utils.js';
import { serializar,responderError } from '../../utils/http.utils.js';
export async function CR_CheckoutMP_CTS(req,res) {
  try { camposPermitidos(req.body,[],{vacio:true});const data=await crearCheckout(req.params.referencia,req.compraToken);return res.status(200).json(serializar({data})); }
  catch(error){return responderError(error,res);}
}
