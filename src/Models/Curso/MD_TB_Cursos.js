/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla cursos de Factor E.
 * Tema: Modelos - Curso
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const CursosModel = db.define(
  'cursos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    titulo: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    slug: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    descripcion_corta: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    descripcion: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },

    portada_archivo_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'archivos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    precio: {
      type: DataTypes.DECIMAL(14,2),
      allowNull: true
    },

    moneda: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: "ARS"
    },

    modalidad: {
      type: DataTypes.ENUM('VIRTUAL','PRESENCIAL','MIXTA'),
      allowNull: false,
      defaultValue: "VIRTUAL"
    },

    estado: {
      type: DataTypes.ENUM('BORRADOR','PUBLICADO','ARCHIVADO'),
      allowNull: false,
      defaultValue: "BORRADOR"
    },

    visible_catalogo: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },

    orden: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },

    creado_por: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
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
    tableName: 'cursos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_cursos_slug', unique: true, fields: ["slug"] },
      { name: 'ix_cursos_publicacion', unique: false, fields: ["estado", "visible_catalogo", "orden"] }
    ]
  }
);

export default CursosModel;
