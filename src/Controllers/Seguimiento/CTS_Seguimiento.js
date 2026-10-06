/* Benjamin Orellana - 06/10/2026 - Consultas privadas para el seguimiento de Juan. */
import { controlador } from '../../utils/http.utils.js';
import { exigir } from '../../utils/validacion.utils.js';
import { listadoSeguimiento, detalleSeguimiento } from '../../Services/Seguimiento/seguimiento.service.js';
export const OBRS_Seguimiento_CTS=controlador(req=>listadoSeguimiento(req.query));
export const OBRS_DetSeguimiento_CTS=controlador(async req=>{
 const result=await detalleSeguimiento(req.params?.id,req.query);
 exigir(result,404,'NO_ENCONTRADO','Asignación no encontrada.');
 return result;
});
