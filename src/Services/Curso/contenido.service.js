/* Benjamin Orellana - 04/10/2026 - Reglas de contenido y transacciones con archivos. */
import { Transaction } from 'sequelize';
import CursosModel from '../../Models/Curso/MD_TB_Cursos.js';
import ModulosModel from '../../Models/Curso/MD_TB_CursoModulos.js';
import LeccionesModel from '../../Models/Curso/MD_TB_CursoLecciones.js';
import { exigir, id } from '../../utils/validacion.utils.js';
import { conAuditoria } from '../Sistema/auditoria.service.js';
import { procesarTrabajos } from '../Archivo/archivoReferencias.service.js';

export function precio(value) {
  if (value === null) return null;
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  exigir(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text), 422, 'PRECIO_INVALIDO', 'precio debe ser positivo o cero y admitir hasta dos decimales.');
  const [whole, decimals = ''] = text.split('.');
  return `${whole}.${decimals.padEnd(2,'0')}`;
}
export async function curso(req, transaction, nuevo = false) {
  const value = id(req.params?.curso_id, 'curso_id');
  const row = await CursosModel.findByPk(value, { ...(transaction ? {transaction,lock:transaction.LOCK.UPDATE} : {}) });
  exigir(row, 404, 'NO_ENCONTRADO', 'Curso no encontrado.');
  if (nuevo) exigir(row.estado !== 'ARCHIVADO', 409, 'CURSO_ARCHIVADO', 'Activar el curso antes de agregar contenido.');
  return row;
}
export async function moduloEnCurso(value, cursoId, transaction) {
  const row = await ModulosModel.findOne({where:{id:id(value,'modulo_id'),curso_id:cursoId},
    ...(transaction ? {transaction,lock:transaction.LOCK.UPDATE} : {})});
  exigir(row, 422, 'MODULO_INVALIDO', 'El módulo no pertenece al curso indicado.');
  return row;
}
export async function leccionEnCurso(value, cursoId, transaction) {
  if (value === null || value === undefined) return null;
  const row = await LeccionesModel.findOne({where:{id:id(value,'leccion_id'),curso_id:cursoId},
    ...(transaction ? {transaction,lock:transaction.LOCK.UPDATE} : {})});
  exigir(row, 422, 'LECCION_INVALIDA', 'La lección no pertenece al curso indicado.');
  return row;
}
export async function conContenido(req, actor, accion, entidad, operation, status = 200, message) {
  const result = await conAuditoria(req, actor, accion, entidad, async transaction => {
    const value = await operation(transaction);
    return {...value,data:{contenido:value.data,trabajos:value.trabajos ?? []}};
  }, {isolationLevel:Transaction.ISOLATION_LEVELS.READ_COMMITTED});
  const eliminaciones = await procesarTrabajos(result.trabajos);
  const pendiente = eliminaciones.some(job => job.estado !== 'COMPLETADA');
  return {status:pendiente ? 202 : status,message,data:result.contenido,
    ...(eliminaciones.length ? {eliminaciones} : {})};
}
