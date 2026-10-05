/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Comercio de Factor E. */

import ArchivosModel from '../Archivo/MD_TB_Archivos.js';
import ClientesModel from '../Cliente/MD_TB_Clientes.js';
import ComercioClientesModel from '../Comercio/MD_TB_ComercioClientes.js';
import ComerciosAmigosModel from '../Comercio/MD_TB_ComerciosAmigos.js';

let relacionesInicializadas = false;

export const initComercioRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  ArchivosModel.hasMany(ComerciosAmigosModel, {
    foreignKey: 'logo_archivo_id',
    as: 'comercios_con_logo',
    constraints: false
  });
  ComerciosAmigosModel.belongsTo(ArchivosModel, {
    foreignKey: 'logo_archivo_id',
    as: 'logo',
    constraints: false
  });

  ComerciosAmigosModel.hasMany(ComercioClientesModel, {
    foreignKey: 'comercio_id',
    as: 'vinculos_clientes',
    constraints: false
  });
  ComercioClientesModel.belongsTo(ComerciosAmigosModel, {
    foreignKey: 'comercio_id',
    as: 'comercio',
    constraints: false
  });

  ClientesModel.hasMany(ComercioClientesModel, {
    foreignKey: 'cliente_id',
    as: 'vinculos_comercios',
    constraints: false
  });
  ComercioClientesModel.belongsTo(ClientesModel, {
    foreignKey: 'cliente_id',
    as: 'cliente',
    constraints: false
  });

  // El modelo intermedio conserva id, funcion y creado_en del vínculo comercial.
  ComerciosAmigosModel.belongsToMany(ClientesModel, {
    through: { model: ComercioClientesModel, unique: false },
    foreignKey: 'comercio_id',
    otherKey: 'cliente_id',
    as: 'clientes',
    constraints: false
  });
  ClientesModel.belongsToMany(ComerciosAmigosModel, {
    through: { model: ComercioClientesModel, unique: false },
    foreignKey: 'cliente_id',
    otherKey: 'comercio_id',
    as: 'comercios',
    constraints: false
  });

  relacionesInicializadas = true;
};
