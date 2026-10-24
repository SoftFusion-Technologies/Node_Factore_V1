/* Benjamin Orellana - 22/10/2026 - Configuración comercial versionada, privada y sin modificar accesos. */
import { modelos } from '../../Models/index.js';
import { bandera, camposPermitidos, entero, exigir, opcion } from '../../utils/validacion.utils.js';
import { auditarAgenda } from './agendaAcceso.service.js';
import { comprobarVersion, entradaAgenda, siguienteVersion } from './agendaDatos.service.js';

const campos = ['precio', 'acceso_duracion_cantidad', 'acceso_duracion_unidad', 'venta_habilitada'];

export function precioAgenda(value) {
  exigir(typeof value === 'string' && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value.trim()),
    422, 'PRECIO_INVALIDO', 'Indicar un precio decimal no negativo con hasta dos decimales.');
  const [entero, decimales = ''] = value.trim().split('.');
  return entero + '.' + decimales.padEnd(2, '0');
}

function vistaVenta(row) {
  return {
    id: String(row.id), nombre: 'Mi agenda', precio: precioAgenda(row.precio), moneda: row.moneda,
    acceso_duracion_cantidad: row.acceso_duracion_cantidad,
    acceso_duracion_unidad: row.acceso_duracion_unidad,
    venta_habilitada: row.venta_habilitada, version: row.version,
    actualizado_por: row.actualizado_por === null ? null : String(row.actualizado_por),
    creado_en: row.creado_en, actualizado_en: row.actualizado_en
  };
}

async function configuracion(ctx, escribir = false) {
  const row = await modelos.agenda_venta_configuracion.findByPk('1', {
    transaction: ctx.transaction,
    lock: escribir ? ctx.transaction.LOCK.UPDATE : ctx.transaction.LOCK.SHARE
  });
  exigir(row && row.moneda === 'ARS', 503, 'AGENDA_VENTA_SIN_CONFIGURAR',
    'La configuración comercial de Mi agenda requiere revisión.');
  return row;
}

export async function obtenerVentaAgenda(req, ctx) {
  camposPermitidos(req.query, [], { vacio: true });
  return vistaVenta(await configuracion(ctx));
}

export async function guardarVentaAgenda(req, ctx) {
  const body = entradaAgenda(req, campos, { version: true });
  const row = await configuracion(ctx, true);
  comprobarVersion(row, body.version);
  const data = {};
  if (body.precio !== undefined) data.precio = precioAgenda(body.precio);
  if (body.venta_habilitada !== undefined) data.venta_habilitada = bandera(body.venta_habilitada, 'venta_habilitada');
  if (body.acceso_duracion_unidad !== undefined) data.acceso_duracion_unidad = opcion(body.acceso_duracion_unidad,
    'acceso_duracion_unidad', ['DIAS', 'MESES', 'SIN_VENCIMIENTO']);

  const unidad = data.acceso_duracion_unidad ?? row.acceso_duracion_unidad;
  if (unidad === 'SIN_VENCIMIENTO') {
    exigir(body.acceso_duracion_cantidad === undefined || body.acceso_duracion_cantidad === null,
      422, 'AGENDA_VENTA_DURACION_INVALIDA', 'Sin vencimiento requiere una cantidad nula.');
    if (body.acceso_duracion_unidad !== undefined || body.acceso_duracion_cantidad !== undefined) data.acceso_duracion_cantidad = null;
  } else if (body.acceso_duracion_cantidad !== undefined) {
    data.acceso_duracion_cantidad = entero(body.acceso_duracion_cantidad, 'acceso_duracion_cantidad', 1,
      unidad === 'MESES' ? 120 : 3650);
  }
  const cantidad = Object.hasOwn(data, 'acceso_duracion_cantidad') ? data.acceso_duracion_cantidad : row.acceso_duracion_cantidad;
  exigir(unidad === 'SIN_VENCIMIENTO' ? cantidad === null : Number.isInteger(cantidad) && cantidad >= 1
    && cantidad <= (unidad === 'MESES' ? 120 : 3650),
  422, 'AGENDA_VENTA_DURACION_INVALIDA', 'Definir una duración válida o elegir Sin vencimiento.');
  const precio = data.precio ?? row.precio;
  exigir(!(data.venta_habilitada ?? row.venta_habilitada) || BigInt(precioAgenda(precio).replace('.', '')) > 0n,
    422, 'AGENDA_VENTA_PRECIO_REQUERIDO', 'Definir un precio mayor a cero antes de preparar la venta.');

  const cambios = Object.keys(data).filter(key => data[key] !== row[key]);
  exigir(Object.keys(body).some(key => key !== 'version'), 422, 'DATOS_INVALIDOS', 'No hay campos para guardar.');
  if (!cambios.length) return vistaVenta(row);
  const anterior = Object.fromEntries(campos.map(key => [key, row[key]]));
  const result = await row.update({ ...data, actualizado_por: ctx.usuario.id, version: siguienteVersion(row) },
    { transaction: ctx.transaction });
  await auditarAgenda(ctx, 'AGENDA_VENTA_CONFIGURADA', 'agenda_venta_configuracion', row.id, {
    campos: cambios, anterior,
    nuevo: Object.fromEntries(campos.map(key => [key, result[key]])), version: result.version
  });
  return vistaVenta(await result.reload({ transaction: ctx.transaction }));
}
