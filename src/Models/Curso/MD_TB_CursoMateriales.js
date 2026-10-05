/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla curso_materiales de Factor E.
 * Tema: Modelos - Curso
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

// Las claves foráneas compuestas ya están definidas en MySQL.
// Su correspondencia se declara en ../relaciones.js para la verificación.
const CursoMaterialesModel = db.define(
  'curso_materiales',
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

    leccion_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },

    archivo_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'archivos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    titulo: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    activo: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1
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
    }
  },
  {
    tableName: 'curso_materiales',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'ix_materiales_curso_orden', unique: false, fields: ["curso_id", "activo", "orden"] }
    ]
  }
);

export default CursoMaterialesModel;
