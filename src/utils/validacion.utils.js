/* Benjamin Orellana - 04/10/2026 - Validaciones de entradas CRM de Factor E. */
export class ErrorHttp extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function exigir(condition, status, code, message) {
  if (!condition) throw new ErrorHttp(status, code, message);
}
export function objeto(value, name = 'cuerpo') {
  exigir(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)),
  422, 'DATOS_INVALIDOS', `${name} debe ser un objeto.`);
  return value;
}
export function camposPermitidos(value, allowed, { vacio = false } = {}) {
  const body = objeto(value ?? {});
  const names = Object.keys(body);
  exigir(vacio || names.length > 0, 422, 'DATOS_INVALIDOS', 'No hay campos para guardar.');
  exigir(names.every(name => allowed.includes(name)), 422, 'CAMPO_NO_PERMITIDO',
    'El cuerpo contiene campos no permitidos.');
  return body;
}
export function id(value, name = 'id') {
  if (typeof value === 'number') exigir(Number.isSafeInteger(value), 422, 'ID_INVALIDO', `${name}: enviar IDs grandes como texto.`);
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  exigir(/^[1-9]\d{0,19}$/.test(text) && BigInt(text || '0') <= 18446744073709551615n,
    422, 'ID_INVALIDO', `${name} debe ser un ID positivo válido.`);
  return text;
}
export function texto(value, name, max, { nullable = false, byteMax } = {}) {
  if (value === null && nullable) return null;
  exigir(typeof value === 'string' && !value.includes('\0'), 422, 'DATOS_INVALIDOS', `${name} debe ser texto válido.`);
  const result = value.trim();
  if (!result && nullable) return null;
  exigir(result.length > 0 && [...result].length <= max && (!byteMax || Buffer.byteLength(result, 'utf8') <= byteMax),
    422, 'DATOS_INVALIDOS', `${name} está vacío o supera el tamaño permitido.`);
  return result;
}
export function opcion(value, name, values) {
  exigir(typeof value === 'string' && values.includes(value), 422, 'DATOS_INVALIDOS', `${name} inválido.`);
  return value;
}
export function bandera(value, name, query = false) {
  if (query && ['0', '1', 'true', 'false'].includes(value)) return ['1', 'true'].includes(value) ? 1 : 0;
  exigir([0, 1, true, false].includes(value), 422, 'DATOS_INVALIDOS', `${name} debe ser true, false, 0 o 1.`);
  return value === true || value === 1 ? 1 : 0;
}
export function entero(value, name, min = 0, max = 4294967295) {
  exigir((typeof value === 'number' && Number.isSafeInteger(value))
    || (typeof value === 'string' && /^\d+$/.test(value)), 422, 'DATOS_INVALIDOS', `${name} debe ser un entero.`);
  const result = Number(value);
  exigir(Number.isSafeInteger(result) && result >= min && result <= max, 422, 'DATOS_INVALIDOS', `${name} fuera de rango.`);
  return result;
}
export function email(value, name) {
  const result = texto(value, name, 254, { nullable: true });
  if (result === null) return null;
  exigir(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 422, 'DATOS_INVALIDOS', `${name} inválido.`);
  return result.toLowerCase();
}
export function url(value, name) {
  const input = texto(value, name, 500, { nullable: true });
  if (input === null) return null;
  let parsed;
  try { parsed = new URL(input); } catch { throw new ErrorHttp(422, 'DATOS_INVALIDOS', `${name} inválida.`); }
  exigir(['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
    422, 'DATOS_INVALIDOS', `${name} debe usar http o https y no incluir credenciales.`);
  return texto(parsed.toString(), name, 500);
}
export function slug(value) {
  const result = texto(value, 'slug', 180);
  exigir(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result), 422, 'DATOS_INVALIDOS', 'slug debe usar minúsculas, números y guiones.');
  return result;
}
export function slugDesdeNombre(name) {
  return slug(name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180).replace(/-+$/g, ''));
}
