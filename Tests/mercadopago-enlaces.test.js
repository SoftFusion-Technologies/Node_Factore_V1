/* Benjamin Orellana - 18/10/2026 - Enlaces sandbox argentinos: creación, recuperación y destinos ajenos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { enlaceSandbox, solicitarPreferencia } from '../src/Services/Pago/mercadoPago.service.js';

const preferencia = '3660661224-59de17d3-66cc-4849-a17a-814c11e89dea';
const argentino = `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${preferencia}`;

test('Preferencia argentina creada por el proveedor conserva el enlace original', async () => {
  let llamadas = 0;
  const resultado = await solicitarPreferencia({ external_reference: 'prueba' }, { token: 'token-simulado' }, async (url, options) => {
    llamadas++;
    assert.equal(url, 'https://api.mercadopago.com/checkout/preferences');
    assert.equal(options.method, 'POST');
    return new Response(JSON.stringify({ id: preferencia, sandbox_init_point: argentino }), {
      status: 201, headers: { 'content-type': 'application/json' }
    });
  });
  assert.equal(llamadas, 1);
  assert.deepEqual(resultado, { id: preferencia, url: argentino });
});

test('Recuperación admite sandbox argentino y global con preferencia coincidente', () => {
  assert.equal(enlaceSandbox(argentino, preferencia), argentino);
  const global = `https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=${preferencia}`;
  assert.equal(enlaceSandbox(global, preferencia), global);
});

test('Rechazar producción, dominios parecidos, credenciales y otra preferencia', () => {
  for (const url of [
    argentino.replace('https:', 'http:'),
    argentino.replace('sandbox.mercadopago.com.ar', 'www.mercadopago.com.ar'),
    argentino.replace('sandbox.mercadopago.com.ar', 'sandbox.mercadopago.com.ar.ejemplo.com'),
    argentino.replace('sandbox.mercadopago.com.ar', 'otro.sandbox.mercadopago.com.ar'),
    argentino.replace('https://', 'https://usuario:clave@'),
    argentino.replace('.com.ar/', '.com.ar:444/'),
    argentino.replace(preferencia, 'otra-preferencia'),
    argentino.replace('/checkout/v1/redirect', '/destino-ajeno')
  ]) {
    assert.throws(() => enlaceSandbox(url, preferencia), { code: 'MP_RESPUESTA_INVALIDA' });
  }
});
