import { initCompraRelaciones } from './Compra/relacionesCompra.js';
/* Benjamin Orellana - 20/10/2026 - Incorporar relaciones y propiedad de Mi agenda. */
import { initAgendaRelaciones } from './Agenda/relacionesAgenda.js';
/* Benjamin Orellana - 04/10/2026 - Inicialización central de relaciones Factor E. */

import { initClienteRelaciones } from './Cliente/relacionesCliente.js';
import { initUsuarioRelaciones } from './Usuario/relacionesUsuario.js';
import { initArchivoRelaciones } from './Archivo/relacionesArchivo.js';
import { initComercioRelaciones } from './Comercio/relacionesComercio.js';
import { initCursoRelaciones } from './Curso/relacionesCurso.js';
import { initAccesoRelaciones } from './Acceso/relacionesAcceso.js';
import { initCampusRelaciones } from './Campus/relacionesCampus.js';
import { initSistemaRelaciones } from './Sistema/relacionesSistema.js';

export function initRelaciones() {
  initClienteRelaciones();
  initUsuarioRelaciones();
  initArchivoRelaciones();
  initComercioRelaciones();
  initCursoRelaciones();
  initAccesoRelaciones();
  initCampusRelaciones();
  initSistemaRelaciones();
  initCompraRelaciones();
  initAgendaRelaciones();
}

// Sequelize resuelve estas asociaciones por id, único en cada tabla.
// MySQL exige también curso_id en contenido y usuario_id en días de agenda.
// Este registro es informativo y se usa para verificar; no ejecuta DDL.
export const clavesForaneasCompuestas = [
  ...['agenda_tareas', 'agenda_notas', 'agenda_tiempo_registros'].map(table => ({
    table,
    fields: ['dia_id', 'usuario_id'],
    target: 'agenda_dias',
    targetFields: ['id', 'usuario_id'],
    onDelete: 'RESTRICT'
  })),
  {
    "table": "curso_lecciones",
    "fields": [
      "modulo_id",
      "curso_id"
    ],
    "target": "curso_modulos",
    "targetFields": [
      "id",
      "curso_id"
    ],
    "onDelete": "RESTRICT"
  },
  {
    "table": "curso_materiales",
    "fields": [
      "leccion_id",
      "curso_id"
    ],
    "target": "curso_lecciones",
    "targetFields": [
      "id",
      "curso_id"
    ],
    "onDelete": "RESTRICT"
  },
  {
    "table": "curso_acceso_lecciones",
    "fields": [
      "acceso_id",
      "curso_id"
    ],
    "target": "curso_accesos",
    "targetFields": [
      "id",
      "curso_id"
    ],
    "onDelete": "RESTRICT"
  },
  {
    "table": "curso_acceso_lecciones",
    "fields": [
      "leccion_id",
      "curso_id"
    ],
    "target": "curso_lecciones",
    "targetFields": [
      "id",
      "curso_id"
    ],
    "onDelete": "RESTRICT"
  },
  {
    "table": "leccion_progreso",
    "fields": [
      "leccion_id",
      "curso_id"
    ],
    "target": "curso_lecciones",
    "targetFields": [
      "id",
      "curso_id"
    ],
    "onDelete": "RESTRICT"
  }
];
