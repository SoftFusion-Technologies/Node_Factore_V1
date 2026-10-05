/* Benjamin Orellana - 05/10/2026 - Probar el login real antes de conectar el frontend. */
import { createInterface } from 'node:readline/promises';
import { passwordOculta } from '../src/utils/terminal.utils.js';
import { configServidor } from '../src/Services/Sistema/configServidor.service.js';

try {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Usar una terminal interactiva.');
  const config = configServidor(), host = config.host === '::1' || config.host === '::' ? '[::1]' : '127.0.0.1';
  const base = `http://${host}:${config.port}`;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let email;
  try { email = (await rl.question('Email: ')).trim(); } finally { rl.close(); }
  let password = await passwordOculta('Contraseña (entrada oculta): '), jar;
  async function enviar(url, method, body) {
    const res = await fetch(base + url, { method, headers: {
      ...(body ? { 'content-type': 'application/json' } : {}), ...(jar ? { cookie: jar.cookie, 'x-csrf-token': jar.csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const value = await res.json();
    if (!res.ok) throw new Error(value.error?.code || `HTTP_${res.status}`);
    return { res, data: value.data };
  }
  async function login() {
    const result = await enviar('/api/auth/login', 'POST', { email, password });
    jar = { cookie: result.res.headers.get('set-cookie').split(';')[0], csrf: result.data.csrf_token };
    return result.data.usuario;
  }
  let user = await login();
  if (user.cambiar_password === 1) {
    console.log('La cuenta requiere cambiar la contraseña. La nueva debe tener entre 15 y 128 caracteres.');
    const nueva = await passwordOculta('Nueva contraseña (entrada oculta): ');
    const repeated = await passwordOculta('Repetir nueva contraseña: ');
    if (nueva !== repeated) throw new Error('Las contraseñas no coinciden.');
    await enviar('/api/auth/password', 'PATCH', { password_actual: password, password_nuevo: nueva });
    password = nueva; jar = undefined; user = await login();
  }
  await enviar('/api/auth/me', 'GET');
  await enviar('/api/auth/logout', 'POST', {});
  console.log(JSON.stringify({ login: true, perfil: true, logout: true, id: user.id, rol: user.rol, cambiar_password: user.cambiar_password }));
} catch (error) {
  console.error(JSON.stringify({ error: error.message === 'fetch failed' ? 'No se pudo conectar. Iniciar el servidor en otra terminal.' : error.message }));
  process.exitCode = 1;
}
