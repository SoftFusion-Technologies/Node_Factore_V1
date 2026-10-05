/* Benjamin Orellana - 05/10/2026 - Historial administrativo de asignaciones. */
import Accesos from '../../Models/Acceso/MD_TB_CursoAccesos.js';
import Historial from '../../Models/Acceso/MD_TB_CursoAccesosHistorial.js';
import Usuarios from '../../Models/Usuario/MD_TB_Usuarios.js';
import { controlador } from '../../utils/http.utils.js';
import { id, opcion, exigir } from '../../utils/validacion.utils.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { Op } from 'sequelize';
export const OBRS_CursoAccesosHistorial_CTS = controlador(async req => {
  const accesoId = id(req.params?.acceso_id, 'acceso_id');
  exigir(await Accesos.findByPk(accesoId, { attributes: ['id'] }), 404, 'NO_ENCONTRADO', 'Asignación no encontrada.');
  const query = consulta(req.query, ['accion']), where = { acceso_id: accesoId };
  if (query.accion !== undefined) where.accion = opcion(query.accion, 'accion',
    ['ASIGNADO', 'RENOVADO', 'SUSPENDIDO', 'REACTIVADO', 'REVOCADO', 'ALCANCE_MODIFICADO', 'LECCION_MODIFICADA']);
  const q = busqueda(query.q); if (q) where.motivo = { [Op.like]: `%${q}%` };
  return listar(Historial, query, { where, include: [{ model: Usuarios, as: 'autor', attributes: ['id', 'nombre'], required: false }] },
    ['id', 'creado_en'], 'id');
});
