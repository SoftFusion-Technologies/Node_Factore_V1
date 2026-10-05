/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Usuario de Factor E. */

import ClientesModel from '../Cliente/MD_TB_Clientes.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';
import UsuariosSesionesModel from '../Usuario/MD_TB_UsuariosSesiones.js';
import UsuariosTokensModel from '../Usuario/MD_TB_UsuariosTokens.js';

let relacionesInicializadas = false;

export const initUsuarioRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  ClientesModel.hasOne(UsuariosModel, {
    foreignKey: 'cliente_id',
    as: 'usuario',
    constraints: false
  });
  UsuariosModel.belongsTo(ClientesModel, {
    foreignKey: 'cliente_id',
    as: 'cliente',
    constraints: false
  });

  UsuariosModel.hasMany(UsuariosSesionesModel, {
    foreignKey: 'usuario_id',
    as: 'sesiones',
    constraints: false
  });
  UsuariosSesionesModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id',
    as: 'usuario',
    constraints: false
  });

  UsuariosModel.hasMany(UsuariosTokensModel, {
    foreignKey: 'usuario_id',
    as: 'tokens',
    constraints: false
  });
  UsuariosTokensModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id',
    as: 'usuario',
    constraints: false
  });

  relacionesInicializadas = true;
};
