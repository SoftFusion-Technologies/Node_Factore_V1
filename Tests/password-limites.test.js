/* Benjamin Orellana - 19/10/2026 - Límites nuevos y acceso compatible con hashes previos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { password, hashPassword, verificarPassword } from '../src/utils/password.utils.js';

test('Contraseñas nuevas: ocho a sesenta caracteres Unicode sin recortar ni normalizar', () => {
  for (const value of ['Curso#26', 'x'.repeat(60), '😀'.repeat(60)]) assert.equal(password(value), value);
  for (const value of ['x'.repeat(7), 'x'.repeat(61), 'abcd\0efgh', null]) {
    assert.throws(() => password(value), error => error.code === 'PASSWORD_INVALIDO');
  }
});
test('Una contraseña de ocho caracteres se almacena con scrypt y verifica completa', async () => {
  const hash = await hashPassword('Curso#26');
  assert.ok(await verificarPassword('Curso#26', hash));
  assert.equal(await verificarPassword('Curso#27', hash), false);
});
test('Las claves previas de hasta 128 caracteres siguen verificando sin cambiarlas', async () => {
  const value = 'a'.repeat(128), salt = 'a1'.repeat(16);
  const key = scryptSync(value, salt, 64, { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 ** 2 });
  const hash = `scrypt$65536$8$2$${salt}$${key.toString('hex')}`;
  assert.ok(await verificarPassword(value, hash));
  assert.equal(await verificarPassword(value.slice(0, 60), hash), false);
  assert.throws(() => password(value), error => error.code === 'PASSWORD_INVALIDO');
});
