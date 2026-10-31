/* Benjamin Orellana - 24/10/2026 - Horas definidas por Juan; validación decimal exacta y edición parcial. */
import { exigir } from '../../utils/validacion.utils.js';

export function cargaHorariaCertificado(value) {
  if (value === null) return null;
  exigir(typeof value === 'string' && /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(value.trim()),
    422, 'CERTIFICADO_HORAS_INVALIDAS', 'La carga horaria debe ser un decimal entre 0.01 y 9999.99 horas.');
  const [entero, decimales = ''] = value.trim().split('.');
  const normalizado = entero + '.' + decimales.padEnd(2, '0');
  exigir(BigInt(normalizado.replace('.', '')) > 0n, 422, 'CERTIFICADO_HORAS_INVALIDAS',
    'La carga horaria debe ser mayor a cero.');
  return normalizado;
}

export function validarConfiguracionCertificado(data, actual = {}) {
  const horas = Object.hasOwn(data, 'certificado_carga_horaria') ? data.certificado_carga_horaria
    : actual.certificado_carga_horaria ?? null;
  const habilitado = data.certificado_habilitado ?? actual.certificado_habilitado ?? 0;
  exigir(habilitado === 0 || habilitado === 1, 422, 'DATOS_INVALIDOS', 'Indicar si el certificado está habilitado.');
  if (horas !== null) cargaHorariaCertificado(horas);
  exigir(!habilitado || horas !== null, 422, 'CERTIFICADO_HORAS_REQUERIDAS',
    'Definir la carga horaria antes de habilitar el certificado.');
}
