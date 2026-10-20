/* Benjamin Orellana - 19/10/2026 - Buzón local explícito; no habilita SMTP inseguro ni producción. */
import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { configCorreoCuenta, enviarCorreoCuenta } from '../src/Services/Usuario/correoCuenta.service.js';

const base = { NODE_ENV: 'development', MP_MODO: 'PRUEBA', CORREO_HABILITADO: 'true', CORREO_PRUEBA_LOCAL: 'true',
  SMTP_HOST: '127.0.0.1', SMTP_PORT: '1587', SMTP_USER: 'usuario-ficticio', SMTP_PASSWORD: 'credencial-ficticia',
  SMTP_FROM: 'cuentas@factore.test', FRONTEND_URL: 'https://factore.example.invalid' };
async function entorno(changes, operation) {
  const previous = Object.fromEntries(Object.keys(base).map(key => [key, process.env[key]]));
  Object.assign(process.env, base, changes);
  try { return await operation(); }
  finally { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

test('Correo local: solo desarrollo/test, Mercado Pago PRUEBA y destino loopback exacto', async () => {
  await entorno({}, () => assert.equal(configCorreoCuenta().port, 1587));
  await entorno({ NODE_ENV: 'test' }, () => assert.equal(configCorreoCuenta().host, '127.0.0.1'));
  for (const change of [{ NODE_ENV: 'production' }, { NODE_ENV: 'staging' }, { MP_MODO: 'PRODUCCION' },
    { CORREO_HABILITADO: 'false' }, { CORREO_PRUEBA_LOCAL: 'false' }, { SMTP_HOST: 'localhost' },
    { SMTP_HOST: '127.0.0.2' }, { SMTP_HOST: 'smtp.example.invalid' }, { SMTP_PORT: '1025' }, { SMTP_PORT: '587' }]) {
    await entorno(change, () => assert.throws(configCorreoCuenta, error => error.code === 'CORREO_NO_CONFIGURADO'));
  }
});

test('SMTP de prueba conserva STARTTLS obligatorio, certificados válidos y credenciales fuera del mensaje', async () => {
  const original = nodemailer.createTransport;
  let transport, mensaje, cerrado = false;
  nodemailer.createTransport = options => { transport = options; return {
    sendMail: async mail => { mensaje = mail; return { accepted: [mail.to.address], rejected: [] }; },
    close() { cerrado = true; }
  }; };
  try {
    await entorno({}, async () => {
      await enviarCorreoCuenta({ destinatario: 'nuevo@example.com', enlace: 'https://factore.example.invalid/activar-cuenta?token=token-ficticio', activacion: true });
      assert.equal(transport.host, '127.0.0.1'); assert.equal(transport.port, 1587);
      assert.equal(transport.requireTLS, true); assert.equal(transport.secure, false);
      assert.equal(transport.tls.rejectUnauthorized, true); assert.equal(transport.tls.minVersion, 'TLSv1.2');
      assert.equal(transport.logger, false); assert.equal(transport.debug, false);
      assert.equal(transport.disableFileAccess, true); assert.equal(transport.disableUrlAccess, true);
      assert.ok(!JSON.stringify(mensaje).includes(base.SMTP_PASSWORD)); assert.equal(cerrado, true);
    });
  } finally { nodemailer.createTransport = original; }
});

test('La configuración real 465/587 mantiene TLS; un error SMTP no revela datos internos', async () => {
  for (const SMTP_PORT of ['465', '587']) {
    await entorno({ NODE_ENV: 'production', CORREO_PRUEBA_LOCAL: 'false', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT },
      () => assert.equal(configCorreoCuenta().port, Number(SMTP_PORT)));
  }
  const original = nodemailer.createTransport;
  nodemailer.createTransport = () => ({ sendMail: async () => { throw new Error('SMTP_PRIVADO_NO_EXPONER'); }, close() {} });
  try {
    await entorno({}, () => assert.rejects(() => enviarCorreoCuenta({ destinatario: 'nuevo@example.com',
      enlace: 'https://factore.example.invalid/login', activacion: false }),
    error => error.code === 'CORREO_NO_ENVIADO' && !error.message.includes('SMTP_PRIVADO_NO_EXPONER')));
  } finally { nodemailer.createTransport = original; }
});
