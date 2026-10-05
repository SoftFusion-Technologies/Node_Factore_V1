/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Acceso de Factor E. */

import CursoAccesoLeccionesModel from '../Acceso/MD_TB_CursoAccesoLecciones.js';
import CursoAccesosModel from '../Acceso/MD_TB_CursoAccesos.js';
import CursoAccesosHistorialModel from '../Acceso/MD_TB_CursoAccesosHistorial.js';
import CursoLeccionesModel from '../Curso/MD_TB_CursoLecciones.js';
import CursosModel from '../Curso/MD_TB_Cursos.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

export const initAccesoRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  UsuariosModel.hasMany(CursoAccesosModel, {
    foreignKey: 'usuario_id',
    as: 'accesos_cursos',
    constraints: false
  });
  CursoAccesosModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id',
    as: 'usuario',
    constraints: false
  });

  CursosModel.hasMany(CursoAccesosModel, {
    foreignKey: 'curso_id',
    as: 'accesos',
    constraints: false
  });
  CursoAccesosModel.belongsTo(CursosModel, {
    foreignKey: 'curso_id',
    as: 'curso',
    constraints: false
  });

  UsuariosModel.hasMany(CursoAccesosModel, {
    foreignKey: 'asignado_por',
    as: 'accesos_asignados',
    constraints: false
  });
  CursoAccesosModel.belongsTo(UsuariosModel, {
    foreignKey: 'asignado_por',
    as: 'asignador',
    constraints: false
  });

  CursoAccesosModel.hasMany(CursoAccesoLeccionesModel, {
    foreignKey: 'acceso_id',
    as: 'lecciones_configuradas',
    constraints: false
  });
  CursoAccesoLeccionesModel.belongsTo(CursoAccesosModel, {
    foreignKey: 'acceso_id',
    as: 'acceso',
    constraints: false
  });

  CursoLeccionesModel.hasMany(CursoAccesoLeccionesModel, {
    foreignKey: 'leccion_id',
    as: 'configuraciones_acceso',
    constraints: false
  });
  CursoAccesoLeccionesModel.belongsTo(CursoLeccionesModel, {
    foreignKey: 'leccion_id',
    as: 'leccion',
    constraints: false
  });

  CursosModel.hasMany(CursoAccesoLeccionesModel, {
    foreignKey: 'curso_id',
    as: 'configuraciones_lecciones',
    constraints: false
  });
  CursoAccesoLeccionesModel.belongsTo(CursosModel, {
    foreignKey: 'curso_id',
    as: 'curso',
    constraints: false
  });

  CursoAccesosModel.hasMany(CursoAccesosHistorialModel, {
    foreignKey: 'acceso_id',
    as: 'historial',
    constraints: false
  });
  CursoAccesosHistorialModel.belongsTo(CursoAccesosModel, {
    foreignKey: 'acceso_id',
    as: 'acceso',
    constraints: false
  });

  UsuariosModel.hasMany(CursoAccesosHistorialModel, {
    foreignKey: 'realizado_por',
    as: 'acciones_accesos',
    constraints: false
  });
  CursoAccesosHistorialModel.belongsTo(UsuariosModel, {
    foreignKey: 'realizado_por',
    as: 'autor',
    constraints: false
  });

  relacionesInicializadas = true;
};
