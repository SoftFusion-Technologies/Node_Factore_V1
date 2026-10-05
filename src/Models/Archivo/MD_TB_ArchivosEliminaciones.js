/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla archivos_eliminaciones de Factor E.
 * Tema: Modelos - Archivo
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ArchivosEliminacionesModel = db.define(
  'archivos_eliminaciones',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    archivo_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'archivos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    solicitado_por: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    estado: {
      type: DataTypes.ENUM('PENDIENTE','EN_PROCESO','COMPLETADA','ERROR'),
      allowNull: false,
      defaultValue: "PENDIENTE"
    },

    intentos: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },

    ultimo_error: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    proximo_intento_en: {
      type: DataTypes.DATE(3),
      allowNull: true
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
    tableName: 'archivos_eliminaciones',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_eliminacion_archivo', unique: true, fields: ["archivo_id"] },
      { name: 'ix_eliminaciones_pendientes', unique: false, fields: ["estado", "proximo_intento_en"] }
    ]
  }
);

export default ArchivosEliminacionesModel;
