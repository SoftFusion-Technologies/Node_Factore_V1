/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
import * as ComprasAgenda from '../src/Controllers/Agenda/CTS_AgendaCompras.js';
/* Benjamin Orellana - 22/10/2026 - Catálogo actualizado con la configuración comercial de Agenda. */
/* Benjamin Orellana - 20/10/2026 - Contratos de controladores de Agenda, sin abrir MySQL. */
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import * as Venta from '../src/Controllers/Agenda/CTS_AgendaVenta.js';
import * as Agenda from '../src/Controllers/Agenda/CTS_Agenda.js';
import * as Accesos from '../src/Controllers/Agenda/CTS_TB_AgendaAccesos.js';
import * as Tareas from '../src/Controllers/Agenda/CTS_TB_AgendaTareas.js';
import * as Notas from '../src/Controllers/Agenda/CTS_TB_AgendaNotas.js';
import * as Tiempos from '../src/Controllers/Agenda/CTS_TB_AgendaTiempoRegistros.js';

try {
  assert.equal(process.argv.length, 2, 'Uso: node Scripts/verificar-agenda-controladores.js');
  const contratos = [
    [ComprasAgenda, ['OBRS_OfertaAgenda_CTS', 'CR_CompraAgenda_CTS', 'OBRS_CompraAgenda_CTS', 'CR_PagoAgenda_CTS', 'ER_CompraAgenda_CTS', 'APLICAR_CompraAgenda_CTS']],
    [Venta, ['OBRS_AgendaVenta_CTS', 'UR_AgendaVenta_CTS']],
    [Agenda, ['OBRS_EstadoMiAgenda_CTS', 'OBRS_MiAgendaMes_CTS', 'OBRS_MiAgendaDia_CTS', 'UR_MiAgendaDia_CTS', 'UR_MisPreferenciasAgenda_CTS']],
    [Accesos, ['OBRS_AgendaAccesoUsuario_CTS', 'UR_AgendaAccesoUsuario_CTS']],
    [Tareas, ['CR_AgendaTarea_CTS', 'UR_AgendaTarea_CTS', 'ER_AgendaTarea_CTS', 'RECORDAR_AgendaTarea_CTS']],
    [Notas, ['CR_AgendaNota_CTS', 'UR_AgendaNota_CTS', 'ER_AgendaNota_CTS', 'ORDENAR_AgendaNotas_CTS']],
    [Tiempos, ['INICIAR_AgendaTiempo_CTS', 'DETENER_AgendaTiempo_CTS', 'ER_AgendaTiempo_CTS']]
  ];
  for (const [modulo, nombres] of contratos) {
    assert.deepEqual(Object.keys(modulo).sort(), [...nombres].sort());
    for (const nombre of nombres) assert.equal(typeof modulo[nombre], 'function');
  }
  assert.equal(Object.keys(modelos).length, 31);
  console.log('Controladores Agenda OK:', JSON.stringify({ controladores: 7,
    funciones: contratos.reduce((n, [, nombres]) => n + nombres.length, 0), servicios: 7, modelos: 31 }));
  // Benjamin Orellana - 21/10/2026 - Mensaje vigente al conectar las rutas de Agenda.
  console.log('Verificación local. No se abrió MySQL ni se modificaron datos o permisos de usuarios.');
} catch (error) {
  console.error('Verificación Agenda fallida:', error.message);
  process.exitCode = 1;
} finally { await db.close(); }
