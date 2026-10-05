/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Curso de Factor E. */

import ArchivosModel from '../Archivo/MD_TB_Archivos.js';
import CursoLeccionesModel from '../Curso/MD_TB_CursoLecciones.js';
import CursoMaterialesModel from '../Curso/MD_TB_CursoMateriales.js';
import CursoModulosModel from '../Curso/MD_TB_CursoModulos.js';
import CursosModel from '../Curso/MD_TB_Cursos.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

export const initCursoRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  ArchivosModel.hasMany(CursosModel, {
    foreignKey: 'portada_archivo_id',
    as: 'cursos_con_portada',
    constraints: false
  });
  CursosModel.belongsTo(ArchivosModel, {
    foreignKey: 'portada_archivo_id',
    as: 'portada',
    constraints: false
  });

  UsuariosModel.hasMany(CursosModel, {
    foreignKey: 'creado_por',
    as: 'cursos_creados',
    constraints: false
  });
  CursosModel.belongsTo(UsuariosModel, {
    foreignKey: 'creado_por',
    as: 'creador',
    constraints: false
  });

  CursosModel.hasMany(CursoModulosModel, {
    foreignKey: 'curso_id',
    as: 'modulos',
    constraints: false
  });
  CursoModulosModel.belongsTo(CursosModel, {
    foreignKey: 'curso_id',
    as: 'curso',
    constraints: false
  });

  CursoModulosModel.hasMany(CursoLeccionesModel, {
    foreignKey: 'modulo_id',
    as: 'lecciones',
    constraints: false
  });
  CursoLeccionesModel.belongsTo(CursoModulosModel, {
    foreignKey: 'modulo_id',
    as: 'modulo',
    constraints: false
  });

  CursosModel.hasMany(CursoLeccionesModel, {
    foreignKey: 'curso_id',
    as: 'lecciones',
    constraints: false
  });
  CursoLeccionesModel.belongsTo(CursosModel, {
    foreignKey: 'curso_id',
    as: 'curso',
    constraints: false
  });

  ArchivosModel.hasMany(CursoLeccionesModel, {
    foreignKey: 'video_archivo_id',
    as: 'lecciones_con_video',
    constraints: false
  });
  CursoLeccionesModel.belongsTo(ArchivosModel, {
    foreignKey: 'video_archivo_id',
    as: 'video',
    constraints: false
  });

  ArchivosModel.hasMany(CursoLeccionesModel, {
    foreignKey: 'portada_archivo_id',
    as: 'lecciones_con_portada',
    constraints: false
  });
  CursoLeccionesModel.belongsTo(ArchivosModel, {
    foreignKey: 'portada_archivo_id',
    as: 'portada',
    constraints: false
  });

  CursosModel.hasMany(CursoMaterialesModel, {
    foreignKey: 'curso_id',
    as: 'materiales',
    constraints: false
  });
  CursoMaterialesModel.belongsTo(CursosModel, {
    foreignKey: 'curso_id',
    as: 'curso',
    constraints: false
  });

  CursoLeccionesModel.hasMany(CursoMaterialesModel, {
    foreignKey: 'leccion_id',
    as: 'materiales',
    constraints: false
  });
  CursoMaterialesModel.belongsTo(CursoLeccionesModel, {
    foreignKey: 'leccion_id',
    as: 'leccion',
    constraints: false
  });

  ArchivosModel.hasMany(CursoMaterialesModel, {
    foreignKey: 'archivo_id',
    as: 'materiales',
    constraints: false
  });
  CursoMaterialesModel.belongsTo(ArchivosModel, {
    foreignKey: 'archivo_id',
    as: 'archivo',
    constraints: false
  });

  relacionesInicializadas = true;
};
