/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Cliente de Factor E. */

import ClientesModel from '../Cliente/MD_TB_Clientes.js';
import ClientesNotasModel from '../Cliente/MD_TB_ClientesNotas.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

export const initClienteRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  ClientesModel.hasMany(ClientesNotasModel, {
    foreignKey: 'cliente_id',
    as: 'notas',
    constraints: false
  });
  ClientesNotasModel.belongsTo(ClientesModel, {
    foreignKey: 'cliente_id',
    as: 'cliente',
    constraints: false
  });

  UsuariosModel.hasMany(ClientesNotasModel, {
    foreignKey: 'creado_por',
    as: 'notas_clientes_creadas',
    constraints: false
  });
  ClientesNotasModel.belongsTo(UsuariosModel, {
    foreignKey: 'creado_por',
    as: 'autor',
    constraints: false
  });

  relacionesInicializadas = true;
};
