/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla comercios_amigos de Factor E.
 * Tema: Modelos - Comercio
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ComerciosAmigosModel = db.define(
  'comercios_amigos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    nombre: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    slug: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    rubro: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    logo_archivo_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'archivos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    ciudad: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    direccion_publica: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    telefono_publico: {
      type: DataTypes.STRING(40),
      allowNull: true
    },

    email_publico: {
      type: DataTypes.STRING(254),
      allowNull: true
    },

    web_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    instagram_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    observaciones_internas: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    mostrar_a_usuarios: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0
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
    },

    actualizado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    }
  },
  {
    tableName: 'comercios_amigos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_comercios_slug', unique: true, fields: ["slug"] },
      { name: 'ix_comercios_visibilidad', unique: false, fields: ["activo", "mostrar_a_usuarios", "orden"] }
    ]
  }
);

export default ComerciosAmigosModel;
