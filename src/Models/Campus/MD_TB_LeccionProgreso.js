/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla leccion_progreso de Factor E.
 * Tema: Modelos - Campus
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

// Las claves foráneas compuestas ya están definidas en MySQL.
// Su correspondencia se declara en ../relaciones.js para la verificación.
const LeccionProgresoModel = db.define(
  'leccion_progreso',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
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
      type: DataTypes.ENUM('EN_CURSO','COMPLETADA'),
      allowNull: false,
      defaultValue: "EN_CURSO"
    },

    posicion_segundos: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },

    iniciada_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    },

    ultimo_acceso_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    },

    completada_en: {
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
    tableName: 'leccion_progreso',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_progreso_usuario_leccion', unique: true, fields: ["usuario_id", "leccion_id"] },
      { name: 'ix_progreso_usuario_curso', unique: false, fields: ["usuario_id", "curso_id"] },
      { name: 'ix_progreso_leccion_curso', unique: false, fields: ["leccion_id", "curso_id"] }
    ]
  }
);

export default LeccionProgresoModel;
