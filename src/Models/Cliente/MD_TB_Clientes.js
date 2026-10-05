/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla crm_clientes de Factor E.
 * Tema: Modelos - Cliente
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ClientesModel = db.define(
  'crm_clientes',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    tipo: {
      type: DataTypes.ENUM('PERSONA','EMPRESA'),
      allowNull: false,
      defaultValue: "PERSONA"
    },

    nombre: {
      type: DataTypes.STRING(180),
      allowNull: false
    },

    razon_social: {
      type: DataTypes.STRING(180),
      allowNull: true
    },

    documento: {
      type: DataTypes.STRING(30),
      allowNull: true
    },

    email: {
      type: DataTypes.STRING(254),
      allowNull: true
    },

    telefono: {
      type: DataTypes.STRING(40),
      allowNull: true
    },

    rubro: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    ciudad: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    estado_comercial: {
      type: DataTypes.ENUM('PROSPECTO','CLIENTE','INACTIVO'),
      allowNull: false,
      defaultValue: "PROSPECTO"
    },

    activo: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1
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
    tableName: 'crm_clientes',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'ix_clientes_nombre', unique: false, fields: ["nombre"] },
      { name: 'ix_clientes_email', unique: false, fields: ["email"] },
      { name: 'ix_clientes_estado', unique: false, fields: ["activo", "estado_comercial"] }
    ]
  }
);

export default ClientesModel;
