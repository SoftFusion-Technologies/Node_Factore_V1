/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla curso_acceso_lecciones de Factor E.
 * Tema: Modelos - Acceso
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

// Las claves foráneas compuestas ya están definidas en MySQL.
// Su correspondencia se declara en ../relaciones.js para la verificación.
const CursoAccesoLeccionesModel = db.define(
  'curso_acceso_lecciones',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    acceso_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    curso_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    leccion_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    estado: {
      type: DataTypes.ENUM('HABILITADA','BLOQUEADA'),
      allowNull: false,
      defaultValue: "HABILITADA"
    },

    inicio_en: {
      type: DataTypes.DATE(3),
      allowNull: true
    },

    vence_en: {
      type: DataTypes.DATE(3),
      allowNull: true
    },

    creado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    },

    actualizado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    }
  },
  {
    tableName: 'curso_acceso_lecciones',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_acceso_leccion', unique: true, fields: ["acceso_id", "leccion_id"] },
      { name: 'ix_acceso_lecciones_acceso_curso', unique: false, fields: ["acceso_id", "curso_id"] },
      { name: 'ix_acceso_lecciones_leccion_curso', unique: false, fields: ["leccion_id", "curso_id"] }
    ]
  }
);

export default CursoAccesoLeccionesModel;
