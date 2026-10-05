/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla curso_lecciones de Factor E.
 * Tema: Modelos - Curso
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

// Las claves foráneas compuestas ya están definidas en MySQL.
// Su correspondencia se declara en ../relaciones.js para la verificación.
const CursoLeccionesModel = db.define(
  'curso_lecciones',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    curso_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    modulo_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    titulo: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    video_archivo_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'archivos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    portada_archivo_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'archivos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    estado: {
      type: DataTypes.ENUM('BORRADOR','PUBLICADA','ARCHIVADA'),
      allowNull: false,
      defaultValue: "BORRADOR"
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
    tableName: 'curso_lecciones',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_lecciones_id_curso', unique: true, fields: ["id", "curso_id"] },
      { name: 'ix_lecciones_modulo_orden', unique: false, fields: ["modulo_id", "estado", "orden"] },
      { name: 'ix_lecciones_curso_estado', unique: false, fields: ["curso_id", "estado"] }
    ]
  }
);

export default CursoLeccionesModel;
