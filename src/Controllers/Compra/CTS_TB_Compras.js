/* Benjamin Orellana - 19/10/2026 - Listado y detalle de compras exclusivos de administración. */
import { controlador } from '../../utils/http.utils.js';
import { listadoCompras, detalleCompra } from '../../Services/Compra/gestionCompras.service.js';

export const OBRS_Compras_CTS = controlador(req => listadoCompras(req.query));
export const OBRS_DetCompra_CTS = controlador(req => detalleCompra(req.params?.id, req.query));
