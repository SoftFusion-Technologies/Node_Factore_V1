/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla usuarios de Factor E.
 * Tema: Modelos - Usuario
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const UsuariosModel = db.define(
  'usuarios',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    cliente_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'crm_clientes', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    nombre: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    email: {
      type: DataTypes.STRING(254),
      allowNull: false
    },

    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    rol: {
      type: DataTypes.ENUM('ADMIN','ALUMNO'),
      allowNull: false,
      defaultValue: "ALUMNO"
    },

    estado: {
      type: DataTypes.ENUM('PENDIENTE','ACTIVO','BLOQUEADO','INACTIVO'),
      allowNull: false,
      defaultValue: "PENDIENTE"
    },

    cambiar_password: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },

    ultimo_ingreso_en: {
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
    tableName: 'usuarios',
    freezeTableName: true,
    timestamps: false,
    // Autenticación accede al hash únicamente con scope('conHash').
    defaultScope: { attributes: { exclude: ['password_hash'] } },
    scopes: { conHash: { attributes: { exclude: [] } } },
    indexes: [
      { name: 'uq_usuarios_cliente', unique: true, fields: ["cliente_id"] },
      { name: 'uq_usuarios_email', unique: true, fields: ["email"] },
      { name: 'ix_usuarios_rol_estado', unique: false, fields: ["rol", "estado"] }
    ]
  }
);

export default UsuariosModel;
