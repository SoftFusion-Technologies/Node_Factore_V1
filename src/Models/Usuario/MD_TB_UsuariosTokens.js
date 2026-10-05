/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla usuarios_tokens de Factor E.
 * Tema: Modelos - Usuario
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const UsuariosTokensModel = db.define(
  'usuarios_tokens',
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

    tipo: {
      type: DataTypes.ENUM('ACTIVACION','RECUPERACION'),
      allowNull: false
    },

    token_hash: {
      type: DataTypes.CHAR(64),
      allowNull: false
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

    usado_en: {
      type: DataTypes.DATE(3),
      allowNull: true
    },

    revocado_en: {
      type: DataTypes.DATE(3),
      allowNull: true
    }
  },
  {
    tableName: 'usuarios_tokens',
    freezeTableName: true,
    timestamps: false,
    // Autenticación accede al hash únicamente con scope('conHash').
    defaultScope: { attributes: { exclude: ['token_hash'] } },
    scopes: { conHash: { attributes: { exclude: [] } } },
    indexes: [
      { name: 'uq_tokens_hash', unique: true, fields: ["token_hash"] },
      { name: 'ix_tokens_usuario_tipo', unique: false, fields: ["usuario_id", "tipo", "vence_en"] }
    ]
  }
);

export default UsuariosTokensModel;
