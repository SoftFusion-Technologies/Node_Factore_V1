/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla curso_modulos de Factor E.
 * Tema: Modelos - Curso
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const CursoModulosModel = db.define(
  'curso_modulos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    curso_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'cursos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    titulo: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM('ACTIVO','ARCHIVADO'),
      allowNull: false,
      defaultValue: "ACTIVO"
    },

    orden: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
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
    tableName: 'curso_modulos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_modulos_id_curso', unique: true, fields: ["id", "curso_id"] },
      { name: 'ix_modulos_curso_orden', unique: false, fields: ["curso_id", "estado", "orden"] }
    ]
  }
);

export default CursoModulosModel;
