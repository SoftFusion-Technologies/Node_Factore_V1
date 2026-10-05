/* Benjamin Orellana - 05/10/2026 - Retención de credenciales invalidadas. */
import { Op, QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import SesionesModel from '../../Models/Usuario/MD_TB_UsuariosSesiones.js';
import TokensModel from '../../Models/Usuario/MD_TB_UsuariosTokens.js';

export const RETENCION_DIAS = 30;
const DIA_MS = 86400000;
const tablas = [
  { nombre: 'sesiones', modelo: SesionesModel, fechas: ['vence_en', 'revocada_en'] },
  { nombre: 'tokens', modelo: TokensModel, fechas: ['vence_en', 'usado_en', 'revocado_en'] }
];

export function corteRetencion(ahora) {
  // mysql2 dateStrings y el adaptador de pruebas devuelven el reloj UTC sin sufijo.
  let value = ahora;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)) value = value.replace(' ', 'T') + 'Z';
  if (!(value instanceof Date) && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value))) throw new Error('RELOJ_UTC_INVALIDO');
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error('RELOJ_UTC_INVALIDO');
  return new Date(milliseconds - RETENCION_DIAS * DIA_MS);
}
function criterio(fechas, corte) {
  // La primera fecha que invalida la credencial inicia su retención.
  // NULL nunca cumple <= corte. creado_en y usuario.estado no autorizan borrado.
  return { [Op.or]: fechas.map(fecha => ({ [fecha]: { [Op.lte]: corte } })) };
}

export async function limpiarCredenciales({ aplicar = false, lote = 500, maxLotes = 20, signal } = {}) {
  if (typeof aplicar !== 'boolean' || !Number.isInteger(lote) || lote < 1 || lote > 1000
    || !Number.isInteger(maxLotes) || maxLotes < 1 || maxLotes > 200) throw new Error('LIMPIEZA_OPCIONES_INVALIDAS');
  const [clock] = await db.query('SELECT UTC_TIMESTAMP(3) AS ahora', { type: QueryTypes.SELECT });
  const corte = corteRetencion(clock?.ahora);
  const result = { modo: aplicar ? 'APLICAR' : 'CONSULTA', retencion_dias: RETENCION_DIAS, corte_utc: corte.toISOString(),
    candidatos: {}, eliminados: { sesiones: 0, tokens: 0 }, pendientes: {}, interrumpido: false };
  for (const tabla of tablas) {
    const where = criterio(tabla.fechas, corte);
    result.candidatos[tabla.nombre] = await tabla.modelo.count({ where });
    if (aplicar) {
      for (let i = 0; i < maxLotes; i++) {
        if (signal?.aborted) break;
        const rows = await tabla.modelo.findAll({ where, attributes: ['id'], order: [['id', 'ASC']], limit: lote, raw: true });
        if (!rows.length || signal?.aborted) break;
        // Revalidar fecha al borrar: una modificación concurrente no convierte
        // una selección anterior en permiso para borrar una credencial válida.
        const removed = await tabla.modelo.destroy({ where: { [Op.and]: [where, { id: { [Op.in]: rows.map(row => row.id) } }] } });
        result.eliminados[tabla.nombre] += removed;
        if (rows.length < lote) break;
      }
    }
    result.pendientes[tabla.nombre] = aplicar ? await tabla.modelo.count({ where }) : result.candidatos[tabla.nombre];
  }
  result.interrumpido = Boolean(signal?.aborted);
  return result;
}
