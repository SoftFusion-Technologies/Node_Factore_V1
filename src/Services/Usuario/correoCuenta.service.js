/* Benjamin Orellana - 18/10/2026 - Activación por SMTP; secretos únicamente en el correo del destinatario. */
import nodemailer from 'nodemailer';
import { configAuth } from './configAuth.service.js';
import { exigir } from '../../utils/validacion.utils.js';

const direccion = value => typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
export function configCorreoCuenta() {
  const host = process.env.SMTP_HOST?.trim(), port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim();
  // Benjamin Orellana - 19/10/2026 - Buzón local explícito, solo DESA y Mercado Pago de prueba; TLS sigue obligatorio.
  const localSolicitado = process.env.CORREO_PRUEBA_LOCAL === 'true';
  const local = localSolicitado && ['development', 'test'].includes(process.env.NODE_ENV) &&
    process.env.MP_MODO === 'PRUEBA' && host === '127.0.0.1' && port === 1587;
  exigir(!localSolicitado || local, 503, 'CORREO_NO_CONFIGURADO', 'El buzón local solo está permitido en desarrollo y modo de prueba.');
  exigir(process.env.CORREO_HABILITADO === 'true' && typeof host === 'string' &&
    /^[A-Za-z0-9.-]+$/.test(host) && ([465, 587].includes(port) || local) && typeof user === 'string' &&
    user.length > 0 && !/[\r\n\0]/.test(user) && typeof pass === 'string' && pass.length > 0 && direccion(from),
  503, 'CORREO_NO_CONFIGURADO', 'El envío de correos todavía no está habilitado. Contactá a Factor E.');
  const front = new URL(configAuth().front);
  exigir(front.protocol === 'https:' || (['development', 'test'].includes(process.env.NODE_ENV) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(front.hostname)), 503, 'CORREO_NO_CONFIGURADO', 'Configurar una dirección de activación segura.');
  return { host, port, user, pass, from, front: front.origin };
}
export async function enviarCorreoCuenta({ destinatario, enlace, activacion }, config = configCorreoCuenta()) {
  exigir(direccion(destinatario), 503, 'CORREO_NO_ENVIADO', 'No se pudo enviar el correo de la cuenta.');
  const url = new URL(enlace);
  exigir(url.origin === config.front && url.pathname === (activacion ? '/activar-cuenta' : '/login') &&
    !url.username && !url.password && !url.hash, 503, 'CORREO_NO_ENVIADO', 'No se pudo preparar el correo de la cuenta.');
  const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: true, auth: { user: config.user, pass: config.pass }, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, dnsTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
  try {
    const response = await transporter.sendMail({ from: { name: 'Factor E', address: config.from },
      to: { address: destinatario }, subject: activacion ? 'Activá tu cuenta de Factor E' : 'Continuá con tu compra en Factor E',
      text: activacion ? `Recibimos una solicitud para crear tu cuenta después de una compra en Factor E.\n\nAbrí este enlace para verificar tu email y elegir tu contraseña:\n${enlace}\n\nVence en 48 horas y puede usarse una sola vez. Volvé al navegador donde compraste para asignar tus cursos.\n\nSi no solicitaste esta cuenta, ignorá este mensaje. Tu cuenta no se activa sin tu confirmación.` :
        `Recibimos una solicitud relacionada con una compra en Factor E.\n\nSi ya tenés cuenta, ingresá desde:\n${enlace}\n\nSi todavía está pendiente de activación, usá el enlace que recibiste o contactá a Factor E. No modificamos tu contraseña.\n\nSi no hiciste esta solicitud, ignorá este mensaje.` });
    exigir(Array.isArray(response.accepted) && response.accepted.length === 1 &&
      (!response.rejected || response.rejected.length === 0), 503, 'CORREO_NO_ENVIADO', 'No se pudo confirmar el envío del correo.');
  } catch {
    // Nunca devolver ni registrar el error SMTP: puede contener el destinatario o datos del servidor.
    exigir(false, 503, 'CORREO_NO_ENVIADO', 'No pudimos confirmar el envío. Revisá tu correo y esperá un minuto antes de volver a solicitarlo.');
  } finally { transporter.close(); }
}
