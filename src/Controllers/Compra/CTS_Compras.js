/* Benjamin Orellana - 13/10/2026 - Compras anónimas con identificador privado. */
import { crearCompra,obtenerCompra,cancelarCompra } from '../../Services/Compra/compra.service.js';
import { serializar,responderError } from '../../utils/http.utils.js';
import { prepararSesionCompra, autenticarCompraNavegador } from '../../Services/Compra/sesionCompra.service.js';
import { entregarCompra } from '../../Services/Compra/entregaCompra.service.js';
import { solicitarCuentaCompra } from '../../Services/Compra/registroCompra.service.js';
import { camposPermitidos,exigir } from '../../utils/validacion.utils.js';
export async function CR_Compra_CTS(req,res) {
  try { const data=await crearCompra(req.body,req.compraToken);return res.status(data.reutilizada?200:201).json(serializar({data})); }
  catch(error){return responderError(error,res);}
}
export async function OBRS_Compra_CTS(req,res) {
  try { const data=await obtenerCompra(req.params.referencia,req.compraToken);return res.status(200).json(serializar({data})); }
  catch(error){return responderError(error,res);}
}
export async function ER_Compra_CTS(req,res) {
  try { camposPermitidos(req.body,[],{vacio:true});const data=await cancelarCompra(req.params.referencia,req.compraToken);return res.status(200).json(serializar({data})); }
  catch(error){return responderError(error,res);}
}

// Benjamin Orellana - 18/10/2026 - Inicializar o recuperar la cookie sin devolver la credencial a JavaScript.
export async function PREPARAR_SesionCompra_CTS(req,res) {
  try {
    exigir(Object.keys(req.query||{}).length===0,422,'COMPRA_INVALIDA','La sesión no admite filtros libres.');
    camposPermitidos(req.body,[],{vacio:true});
    return res.status(200).json({data:await prepararSesionCompra(req,res)});
  } catch(error) { return responderError(error,res); }
}
export async function OBRS_SesionCompra_CTS(req,res) {
  try { return res.status(200).json({data:req.compraSesion}); }
  catch(error) { return responderError(error,res); }
}
export async function CR_CompraNavegador_CTS(req,res) {
  try { exigir(req.body?.referencia===req.params.referencia,422,'COMPRA_INVALIDA','La solicitud no corresponde a esta compra.'); }
  catch(error) { return responderError(error,res); }
  return CR_Compra_CTS(req,res);
}

// Benjamin Orellana - 19/10/2026 - Exigir ambas sesiones y ambos CSRF; ningún ID de alumno viene del cuerpo.
export async function VINCULAR_Compra_CTS(req, res) {
  try {
    exigir(Object.keys(req.query || {}).length === 0, 422, 'COMPRA_INVALIDA', 'La compra no admite filtros libres.');
    await autenticarCompraNavegador(req, { csrfHeader: 'x-compra-csrf' });
    camposPermitidos(req.body, [], { vacio: true });
    return res.status(200).json(serializar({ data: await entregarCompra(req) }));
  } catch (error) { return responderError(error, res); }
}

// Benjamin Orellana - 18/10/2026 - Crear una cuenta pendiente y verificar su email; nunca devolver el enlace de activación.
export async function REGISTRAR_CuentaCompra_CTS(req, res) {
  try {
    camposPermitidos(req.body, [], { vacio: true });
    return res.status(202).json({ data: await solicitarCuentaCompra(req) });
  } catch (error) { return responderError(error, res); }
}
