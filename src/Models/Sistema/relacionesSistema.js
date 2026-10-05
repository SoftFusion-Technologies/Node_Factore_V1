/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Sistema de Factor E. */

import AuditoriaEventosModel from '../Sistema/MD_TB_AuditoriaEventos.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

export const initSistemaRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  UsuariosModel.hasMany(AuditoriaEventosModel, {
    foreignKey: 'usuario_id',
    as: 'eventos_auditoria',
    constraints: false
  });
  AuditoriaEventosModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id',
    as: 'usuario',
    constraints: false
  });

  relacionesInicializadas = true;
};
