/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
/* Benjamin Orellana - 19/10/2026 - Consultas administrativas de compras; nunca generan cobros ni accesos. */
import { Op, literal, where as comparar } from 'sequelize';
import db from '../../DataBase/db.js';
import { modelos as m } from '../../Models/index.js';
import { consulta, busqueda, listar } from '../../utils/listados.utils.js';
import { exigir, opcion, bandera, id } from '../../utils/validacion.utils.js';
import { fechaUTC, estadoTemporal, ahoraDB } from '../Acceso/permisoAcceso.service.js';

const camposCompra = ['id', 'referencia', 'comprador_nombre', 'comprador_email', 'usuario_id',
  'estado', 'total', 'moneda', 'vence_en', 'pagada_en', 'creado_en', 'actualizado_en',
  'mp_preferencia_estado', 'mp_preferencia_id', 'mp_error_codigo'];
const camposCuenta = ['id', 'nombre', 'email', 'rol', 'estado', 'cliente_id'];
const camposItem = ['id', 'compra_id', 'curso_id', 'titulo', 'slug', 'precio_unitario', 'moneda',
  'acceso_duracion_cantidad', 'acceso_duracion_unidad'];
const camposPago = ['id', 'compra_id', 'mp_pago_id', 'estado', 'detalle_estado', 'validacion',
  'motivo_revision', 'importe', 'importe_reintegrado', 'moneda', 'modo_prueba',
  'aprobado_en', 'mp_actualizado_en', 'verificado_en'];
// Alias constantes. Los únicos valores variables se validan y escapan con Sequelize.
const entregasSQL = `(SELECT COUNT(*) FROM auditoria_eventos e WHERE e.entidad='compras'
  AND e.entidad_id=compras.id AND e.accion='COMPRA_ENTREGADA')`;
const comprobantesSQL = `(SELECT COUNT(*) FROM auditoria_eventos e WHERE e.entidad='compras'
  AND e.entidad_id=compras.id AND e.accion='COMPRA_ENTREGADA' AND e.usuario_id=compras.usuario_id)`;
const revisionSQL = `EXISTS(SELECT 1 FROM compra_pagos p WHERE p.compra_id=compras.id AND p.validacion='REVISION')`;
const estadoSQL = `CASE WHEN compras.estado='PENDIENTE' AND compras.vence_en<=UTC_TIMESTAMP(3)
  THEN 'VENCIDA' ELSE compras.estado END`;
const entregaSQL = `CASE
  WHEN EXISTS(SELECT 1 FROM agenda_compras ac WHERE ac.compra_id=compras.id) AND compras.estado<>'PAGADA' THEN 'NO_CORRESPONDE'
  WHEN EXISTS(SELECT 1 FROM agenda_compras ac WHERE ac.compra_id=compras.id AND ac.entregada_en IS NULL) AND compras.estado='PAGADA' THEN 'PENDIENTE' 
  WHEN compras.usuario_id IS NOT NULL AND compras.estado='PAGADA' AND ${entregasSQL}=1 AND ${comprobantesSQL}=1 THEN 'ENTREGADA'
  WHEN compras.usuario_id IS NOT NULL OR ${entregasSQL}>0 THEN 'REVISION'
  WHEN compras.estado='PAGADA' THEN 'PENDIENTE' ELSE 'NO_CORRESPONDE' END`;
const calculados = [[literal(estadoSQL), 'estado_temporal'], [literal(entregaSQL), 'estado_entrega'],
  [literal(revisionSQL), 'pago_en_revision'], [literal(entregasSQL), 'cantidad_entregas']];
const cuenta = { model: m.usuarios, as: 'usuario', attributes: camposCuenta, required: false };

function parametros(query) {
  const q = consulta(query, ['estado_temporal', 'estado_entrega', 'pago_en_revision',
    'curso_id', 'usuario_id', 'creado_desde', 'creado_hasta']);
  const condiciones = [];
  const textoBusqueda = busqueda(q.q);
  if (textoBusqueda) condiciones.push({ [Op.or]: ['comprador_nombre', 'comprador_email', 'referencia']
    .map(column => ({ [column]: { [Op.like]: `%${textoBusqueda}%` } })) });
  if (q.estado_temporal !== undefined) condiciones.push(comparar(literal(estadoSQL),
    opcion(q.estado_temporal, 'estado_temporal', ['PENDIENTE', 'VENCIDA', 'PAGADA', 'CANCELADA'])));
  if (q.estado_entrega !== undefined) condiciones.push(comparar(literal(entregaSQL),
    opcion(q.estado_entrega, 'estado_entrega', ['PENDIENTE', 'ENTREGADA', 'REVISION', 'NO_CORRESPONDE'])));
  if (q.pago_en_revision !== undefined) condiciones.push(comparar(literal(`(${revisionSQL})`),
    bandera(q.pago_en_revision, 'pago_en_revision', true)));
  if (q.usuario_id !== undefined) condiciones.push({ usuario_id: id(q.usuario_id, 'usuario_id') });
  if (q.curso_id !== undefined) condiciones.push(literal(`EXISTS(SELECT 1 FROM compra_items i
    WHERE i.compra_id=compras.id AND i.curso_id=${db.escape(id(q.curso_id, 'curso_id'))})`));
  const desde = q.creado_desde === undefined ? null : fechaUTC(q.creado_desde, 'creado_desde');
  const hasta = q.creado_hasta === undefined ? null : fechaUTC(q.creado_hasta, 'creado_hasta');
  exigir(!desde || !hasta || hasta > desde, 422, 'FILTRO_INVALIDO', 'El límite final debe ser posterior al inicial.');
  if (desde || hasta) condiciones.push({ creado_en: { ...(desde ? { [Op.gte]: desde } : {}), ...(hasta ? { [Op.lt]: hasta } : {}) } });
  return { query: { ordenar_por: 'creado_en', direccion: 'DESC', ...q }, where: { [Op.and]: condiciones } };
}

function normalizar(row) {
  const value = row.get({ plain: true });
  value.pago_en_revision = Number(value.pago_en_revision) === 1;
  value.cantidad_entregas = Number(value.cantidad_entregas);
  return value;
}

export async function listadoCompras(query) {
  const filtros = parametros(query);
  const result = await listar(m.compras, filtros.query,
    { attributes: [...camposCompra, ...calculados], where: filtros.where, include: [cuenta] },
    ['id', 'creado_en', 'actualizado_en', 'total', 'comprador_nombre'], 'creado_en');
  const ids = result.data.map(row => row.id);
  const items = ids.length ? await m.compra_items.findAll({ attributes: camposItem,
    where: { compra_id: { [Op.in]: ids } }, order: [['compra_id', 'ASC'], ['id', 'ASC']] }) : [];
  const agendas = ids.length ? await m.agenda_compras.findAll({ where: { compra_id: { [Op.in]: ids } } }) : [];
  for (const item of agendas) items.push({ ...item.get({ plain: true }), tipo: 'AGENDA', titulo: 'Mi agenda', curso_id: null });
  const porCompra = new Map();
  for (const item of items) {
    const key = String(item.compra_id);
    if (!porCompra.has(key)) porCompra.set(key, []);
    porCompra.get(key).push(item);
  }
  return { ...result, data: result.data.map(row => ({ ...normalizar(row), items: porCompra.get(String(row.id)) || [] })) };
}

export async function detalleCompra(value, query = {}) {
  exigir(Object.keys(query).length === 0, 422, 'FILTRO_INVALIDO', 'El detalle no admite filtros.');
  const compra = await m.compras.findByPk(id(value), { attributes: [...camposCompra, ...calculados], include: [cuenta] });
  exigir(compra, 404, 'NO_ENCONTRADO', 'Compra no encontrada.');
  const data = normalizar(compra);
  const items = await m.compra_items.findAll({ attributes: camposItem, where: { compra_id: compra.id },
    include: [{ model: m.cursos, as: 'curso', attributes: ['id', 'titulo', 'estado', 'venta_online_habilitada'], required: false }],
    order: [['id', 'ASC']] });
  // Una coincidencia de email ayuda a revisar; no implica cuenta asignada ni autoriza una entrega.
  const candidata = compra.usuario || await m.usuarios.findOne({ attributes: camposCuenta, where: { email: compra.comprador_email } });
  const cliente = candidata?.cliente_id ? await m.crm_clientes.findByPk(candidata.cliente_id,
    { attributes: ['id', 'tipo', 'nombre', 'email', 'activo', 'estado_comercial'] }) : null;
  const accesos = candidata && items.length ? await m.curso_accesos.findAll({
    attributes: ['id', 'usuario_id', 'curso_id', 'alcance', 'estado', 'inicio_en', 'vence_en'],
    where: { usuario_id: candidata.id, curso_id: { [Op.in]: items.map(item => item.curso_id) } } }) : [];
  const excepciones = accesos.length ? await m.curso_acceso_lecciones.findAll({ attributes: ['acceso_id'],
    where: { acceso_id: { [Op.in]: accesos.map(acceso => acceso.id) } } }) : [];
  const conExcepciones = new Set(excepciones.map(row => String(row.acceso_id)));
  const ahora = await ahoraDB();
  const porCurso = new Map(accesos.map(acceso => [String(acceso.curso_id), {
    ...acceso.get({ plain: true }), estado_temporal: estadoTemporal(acceso, ahora),
    tiene_excepciones: conExcepciones.has(String(acceso.id)),
    requiere_revision_para_asignar: acceso.estado !== 'ACTIVO' || acceso.alcance !== 'COMPLETO' || conExcepciones.has(String(acceso.id))
  }]));
  const detalles = items.map(item => ({ ...item.get({ plain: true }), acceso_actual: porCurso.get(String(item.curso_id)) || null }));
  const agenda = await m.agenda_compras.findOne({ where: { compra_id: compra.id } });
  if (agenda) {
    const accesoAgenda = await m.agenda_accesos.findOne({ where: { usuario_id: agenda.usuario_id } });
    const detalle = { ...agenda.get({ plain: true }), tipo: 'AGENDA', titulo: 'Mi agenda', curso_id: null,
      acceso_actual: accesoAgenda ? { ...accesoAgenda.get({ plain: true }), estado_temporal: estadoTemporal(accesoAgenda, ahora),
        requiere_revision_para_asignar: accesoAgenda.estado !== 'ACTIVO' } : null };
    detalles.push(detalle);
  }
  const pagos = await m.compra_pagos.findAll({ attributes: camposPago,
    where: { compra_id: compra.id }, order: [['id', 'ASC']] });
  const eventos = await m.auditoria_eventos.findAll({ attributes: ['id', 'usuario_id', 'accion', 'creado_en'],
    where: { entidad: 'compras', entidad_id: compra.id }, order: [['id', 'ASC']] });
  return { data: { ...data, cuenta_por_email: candidata, cliente,
    items: detalles,
    pagos, eventos } };
}
