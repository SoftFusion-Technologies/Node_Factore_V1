/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla usuarios_sesiones de Factor E.
 * Tema: Modelos - Usuario
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const UsuariosSesionesModel = db.define(
  'usuarios_sesiones',
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

    token_hash: {
      type: DataTypes.CHAR(64),
      allowNull: false
    },

    ip: {
      type: DataTypes.STRING(45),
      allowNull: true
    },

    user_agent: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    creado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    },

    vence_en: {
      type: DataTypes.DATE(3),
      allowNull: false
    },

    revocada_en: {
      type: DataTypes.DATE(3),
      allowNull: true
    },

    ultimo_uso_en: {
      type: DataTypes.DATE(3),
      allowNull: true
    }
  },
  {
    tableName: 'usuarios_sesiones',
    freezeTableName: true,
    timestamps: false,
    // Autenticación accede al hash únicamente con scope('conHash').
    defaultScope: { attributes: { exclude: ['token_hash'] } },
    scopes: { conHash: { attributes: { exclude: [] } } },
    indexes: [
      { name: 'uq_sesiones_token', unique: true, fields: ["token_hash"] },
      { name: 'ix_sesiones_usuario_fecha', unique: false, fields: ["usuario_id", "vence_en"] }
    ]
  }
);

export default UsuariosSesionesModel;
