/* Benjamin Orellana - 24/10/2026 - Un detalle financiero común para cursos y Agenda, sin mezclar productos. */
import ItemsModel from '../../Models/Compra/MD_TB_CompraItems.js';
import AgendaComprasModel from '../../Models/Agenda/MD_TB_AgendaCompras.js';
import { exigir } from '../../utils/validacion.utils.js';

export async function itemsPagoCompra(compra, transaction) {
  const options = { where: { compra_id: compra.id }, transaction };
  const agenda = await AgendaComprasModel.findOne(options);
  const cursos = await ItemsModel.findAll({ ...options, order: [['curso_id', 'ASC']] });
  exigir(!agenda || (!cursos.length && String(agenda.usuario_id) === String(compra.usuario_id)),
    409, 'COMPRA_IMPORTE_INVALIDO', 'El detalle de la compra requiere revisión.');
  return agenda ? [{ ...agenda.get({ plain: true }), producto_id: 'agenda-' + agenda.id, titulo: 'Mi agenda', tipo: 'AGENDA' }]
    : cursos.map(item => ({ ...item.get({ plain: true }), producto_id: String(item.curso_id), tipo: 'CURSO' }));
}
