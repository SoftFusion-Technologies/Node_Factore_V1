/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla archivos de Factor E.
 * Tema: Modelos - Archivo
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ArchivosModel = db.define(
  'archivos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    uuid: {
      type: DataTypes.CHAR(36),
      allowNull: false
    },

    tipo: {
      type: DataTypes.ENUM('VIDEO','IMAGEN','DOCUMENTO'),
      allowNull: false
    },

    nombre_original: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    nombre_guardado: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    ruta_relativa: {
      type: DataTypes.STRING(500),
      allowNull: false
    },

    mime_type: {
      type: DataTypes.STRING(120),
      allowNull: false
    },

    extension: {
      type: DataTypes.STRING(20),
      allowNull: false
    },

    tamanio_bytes: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    duracion_segundos: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },

    sha256: {
      type: DataTypes.CHAR(64),
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM('SUBIENDO','DISPONIBLE','PENDIENTE_ELIMINACION','ELIMINADO'),
      allowNull: false,
      defaultValue: "SUBIENDO"
    },

    subido_por: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    eliminado_en: {
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
    tableName: 'archivos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_archivos_uuid', unique: true, fields: ["uuid"] },
      { name: 'uq_archivos_ruta', unique: true, fields: ["ruta_relativa"] },
      { name: 'ix_archivos_tipo_estado', unique: false, fields: ["tipo", "estado"] }
    ]
  }
);

export default ArchivosModel;
