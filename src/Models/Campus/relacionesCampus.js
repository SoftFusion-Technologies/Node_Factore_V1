/* Benjamin Orellana - 04/10/2026 - Relaciones del módulo Campus de Factor E. */

import CursoLeccionesModel from '../Curso/MD_TB_CursoLecciones.js';
import CursosModel from '../Curso/MD_TB_Cursos.js';
import LeccionProgresoModel from '../Campus/MD_TB_LeccionProgreso.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';

let relacionesInicializadas = false;

export const initCampusRelaciones = () => {
  if (relacionesInicializadas) return;

  // Las asociaciones permiten includes; las FK físicas ya existen en MySQL.
  // constraints: false conserva sus definiciones y no reemplaza las FK compuestas.

  UsuariosModel.hasMany(LeccionProgresoModel, {
    foreignKey: 'usuario_id',
    as: 'progreso_lecciones',
    constraints: false
  });
  LeccionProgresoModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id',
    as: 'usuario',
    constraints: false
  });

  CursoLeccionesModel.hasMany(LeccionProgresoModel, {
    foreignKey: 'leccion_id',
    as: 'progresos',
    constraints: false
  });
  LeccionProgresoModel.belongsTo(CursoLeccionesModel, {
    foreignKey: 'leccion_id',
    as: 'leccion',
    constraints: false
  });

  CursosModel.hasMany(LeccionProgresoModel, {
    foreignKey: 'curso_id',
    as: 'progresos_lecciones',
    constraints: false
  });
  LeccionProgresoModel.belongsTo(CursosModel, {
    foreignKey: 'curso_id',
    as: 'curso',
    constraints: false
  });

  relacionesInicializadas = true;
};
