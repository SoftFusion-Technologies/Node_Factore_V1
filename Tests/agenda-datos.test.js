/* Benjamin Orellana - 20/10/2026 - Calendario argentino, pesos y límites de Agenda. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fechaAgenda, fechaArgentina, rangoMes, horaAgenda, progresoAgenda, segundosRegistro, versionAgenda } from '../src/Services/Agenda/agendaDatos.service.js';

test('Calendario de Agenda: fechas exactas sin normalizar errores y cambio de día en UTC−3', () => {
  assert.equal(fechaAgenda('2028-02-29'), '2028-02-29');
  for (const fecha of ['2026-02-29', '2026-04-31', '2026-1-01', '2026-01-01T00:00:00Z', '0000-01-01', null]) assert.throws(() => fechaAgenda(fecha));
  assert.equal(rangoMes('2028-02').hasta, '2028-02-29');
  assert.equal(rangoMes('9999-12').hasta, '9999-12-31');
  assert.equal(fechaArgentina(new Date('2026-10-21T02:59:59.999Z')), '2026-10-20');
  assert.equal(fechaArgentina(new Date('2026-10-21T03:00:00.000Z')), '2026-10-21');
});
test('Progreso: P1=5, P2=3, P3=1, pilar=4; vacío y 100 redondeado no implican día completado', () => {
  assert.equal(progresoAgenda(null).estado, 'VACIO');
  const dia = { prioridad_1_texto: 'Objetivo', prioridad_1_cumplida: 1 };
  assert.equal(progresoAgenda(dia).porcentaje, 100);
  const tareas = [{ prioridad: 1, completada: 1 }, { prioridad: 2, completada: 0 }, { prioridad: 3, completada: 0 }];
  assert.equal(progresoAgenda(dia, tareas).porcentaje, 69);
  const muchas = [...Array.from({ length: 200 }, () => ({ prioridad: 1, completada: 1 })), { prioridad: 3, completada: 0 }];
  assert.equal(progresoAgenda(null, muchas).porcentaje, 100);
  assert.equal(progresoAgenda(null, muchas).estado, 'PENDIENTE');
});
test('Hora, versión y duración: límites estrictos; un cronómetro no acumula después del vencimiento', () => {
  assert.equal(horaAgenda('23:59'), '23:59:00'); assert.equal(horaAgenda(''), null);
  for (const hora of ['24:00', '-01:00', '12:30:01', 1230]) assert.throws(() => horaAgenda(hora));
  for (const version of [undefined, 0, -1, 1.5, '1e3', 4294967295]) assert.throws(() => versionAgenda(version));
  const registro = { inicio_en: '2026-10-21T01:00:00Z', fin_en: null, duracion_segundos: null };
  assert.equal(segundosRegistro(registro, new Date('2026-10-21T01:05:00Z'), '2026-10-21T01:02:00Z'), 120);
  assert.equal(segundosRegistro(registro, new Date('2026-10-21T00:59:00Z')), 0);
});
