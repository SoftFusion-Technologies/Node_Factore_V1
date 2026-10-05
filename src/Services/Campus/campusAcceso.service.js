/* Benjamin Orellana - 05/10/2026 - Identidad del alumno y consultas con alcance propio. */
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import { sesionActual } from '../Usuario/auth.service.js';
import { cookieSesion } from '../Usuario/configAuth.service.js';
import { serializar, responderError } from '../../utils/http.utils.js';
import { exigir } from '../../utils/validacion.utils.js';
import { opcionesListado } from '../../utils/listados.utils.js';

export async function alumno(req) {
  // Revalidar incluso si el middleware ya pasó. Nunca confiar en un req.user enviado por el cliente.
  const session = await sesionActual(req);
  exigir(session.usuario.rol === 'ALUMNO', 403, 'NO_AUTORIZADO', 'Esta sección corresponde al alumno.');
  exigir(session.usuario.cambiar_password === 0, 403, 'CAMBIAR_PASSWORD', 'Cambiar la contraseña para continuar.');
  return session;
}
export function controladorAlumno(operation) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const session = await alumno(req), result = await operation(req, session);
      const { status = 200, ...body } = result;
      return res.status(status).json(serializar(body));
    } catch (error) {
      if (error.status === 401) cookieSesion(res);
      return responderError(error, res);
    }
  };
}
export function seleccionar(sql, replacements, transaction) {
  return db.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
}
export async function listadoSQL(sql, replacements, query, orderMap, defaultOrder) {
  const { pagina, ...options } = opcionesListado(query, Object.keys(orderMap), defaultOrder);
  // Nombres internos constantes y dirección validada; los valores van como parámetros.
  const order = options.order.map(([column, direction]) => `${orderMap[column]} ${direction}`).join(', ');
  const paginado = options.limit !== undefined;
  const data = await seleccionar(sql + ' ORDER BY ' + order + (paginado ? ' LIMIT ? OFFSET ?' : ''),
    [...replacements, ...(paginado ? [options.limit, options.offset] : [])]);
  if (!paginado) return { data, meta: { paginado: false, total: data.length } };
  const [count] = await seleccionar(`SELECT COUNT(*) AS total FROM (${sql}) campus_total`, replacements);
  const total = Number(count.total);
  return { data, meta: { paginado: true, pagina, por_pagina: options.limit, total, total_paginas: Math.ceil(total / options.limit) } };
}
