/* Benjamin Orellana - 05/10/2026 - Limpieza diaria integrada en server.js. */
import { limpiarCredenciales } from '../Services/Sistema/limpiezaCredenciales.service.js';
export const INTERVALO_LIMPIEZA_MS = 24 * 60 * 60 * 1000;
export function iniciarLimpiezaCredenciales({ limpiar = limpiarCredenciales, registrar = entry => console.log(JSON.stringify(entry)),
  programarTimer = setTimeout, cancelarTimer = clearTimeout } = {}) {
  const controller = new AbortController();
  let timer = null, pending = null, stopped = false;
  function schedule(delay) {
    timer = programarTimer(() => {
      timer = null;
      if (stopped) return;
      pending = run().finally(() => {
        pending = null;
        if (!stopped) schedule(INTERVALO_LIMPIEZA_MS);
      });
      return pending;
    }, delay);
    timer.unref?.();
  }
  async function run() {
    try {
      const resultado = await limpiar({ aplicar: true, signal: controller.signal });
      registrar({ event: 'LIMPIEZA_CREDENCIALES', ...resultado });
    } catch (error) {
      // No loguear SQL, enlaces, direcciones de clientes ni credenciales.
      try { registrar({ event: 'LIMPIEZA_CREDENCIALES_ERROR', code: error.original?.code || error.code || error.name || 'ERROR' }); } catch { /* Un fallo del logger no detiene la API. */ }
    }
  }
  // Una ejecución al iniciar permite recuperar mantenimiento con la API apagada.
  schedule(0);
  return {
    async detener() {
      stopped = true; controller.abort();
      if (timer !== null) { cancelarTimer(timer); timer = null; }
      await pending;
    }
  };
}
