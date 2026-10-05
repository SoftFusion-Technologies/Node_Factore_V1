/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Archivo de Factor E. */

import ArchivosModel from './MD_TB_Archivos.js';
import ArchivosEliminacionesModel from './MD_TB_ArchivosEliminaciones.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

export const initArchivoRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  UsuariosModel.hasMany(ArchivosModel, {
    foreignKey: 'subido_por',
    as: 'archivos_subidos',
    constraints: false
  });
  ArchivosModel.belongsTo(UsuariosModel, {
    foreignKey: 'subido_por',
    as: 'subido_por_usuario',
    constraints: false
  });

  ArchivosModel.hasOne(ArchivosEliminacionesModel, {
    foreignKey: 'archivo_id',
    as: 'eliminacion',
    constraints: false
  });
  ArchivosEliminacionesModel.belongsTo(ArchivosModel, {
    foreignKey: 'archivo_id',
    as: 'archivo',
    constraints: false
  });

  UsuariosModel.hasMany(ArchivosEliminacionesModel, {
    foreignKey: 'solicitado_por',
    as: 'eliminaciones_solicitadas',
    constraints: false
  });
  ArchivosEliminacionesModel.belongsTo(UsuariosModel, {
    foreignKey: 'solicitado_por',
    as: 'solicitante',
    constraints: false
  });

  relacionesInicializadas = true;
};
