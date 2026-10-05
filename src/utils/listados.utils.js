/* Benjamin Orellana - 04/10/2026 - Listados completos o paginación explícita. */
import { exigir, objeto, texto, opcion, entero } from './validacion.utils.js';

export function consulta(query = {}, filters = []) {
  const value = objeto(query, 'query');
  const allowed = [...filters, 'q', 'pagina', 'por_pagina', 'ordenar_por', 'direccion'];
  exigir(Object.keys(value).every(key => allowed.includes(key)), 422, 'FILTRO_INVALIDO', 'Hay filtros no permitidos.');
  return value;
}
export function busqueda(value) {
  if (value === undefined || (typeof value === 'string' && !value.trim())) return null;
  return texto(value, 'q', 180);
}
export function opcionesListado(query, allowedOrder, defaultOrder) {
  const column = query.ordenar_por === undefined ? defaultOrder : opcion(query.ordenar_por, 'ordenar_por', allowedOrder);
  const direction = query.direccion === undefined ? 'ASC' : opcion(query.direccion, 'direccion', ['ASC', 'DESC']);
  const order = [[column, direction], ...(column === 'id' ? [] : [['id', 'ASC']])];
  if (query.pagina === undefined && query.por_pagina === undefined) return { order };
  const pagina = entero(query.pagina ?? 1, 'pagina', 1, Number.MAX_SAFE_INTEGER);
  const porPagina = entero(query.por_pagina ?? 20, 'por_pagina', 1, 500);
  const offset = (pagina - 1) * porPagina;
  exigir(Number.isSafeInteger(offset), 422, 'FILTRO_INVALIDO', 'La página solicitada está fuera de rango.');
  return { order, limit: porPagina, offset, pagina };
}
export async function listar(model, query, options, allowedOrder, defaultOrder) {
  const { pagina, ...pagination } = opcionesListado(query, allowedOrder, defaultOrder);
  if (pagination.limit === undefined) {
    const rows = await model.findAll({ ...options, ...pagination });
    return { data: rows, meta: { paginado: false, total: rows.length } };
  }
  const { rows, count } = await model.findAndCountAll({ ...options, ...pagination, distinct: true, col: 'id' });
  return { data: rows, meta: { paginado: true, pagina, por_pagina: pagination.limit, total: count,
    total_paginas: Math.ceil(count / pagination.limit) } };
}
