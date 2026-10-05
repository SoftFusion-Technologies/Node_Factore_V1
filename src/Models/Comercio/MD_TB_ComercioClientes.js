/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla comercio_clientes de Factor E.
 * Tema: Modelos - Comercio
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ComercioClientesModel = db.define(
  'comercio_clientes',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    comercio_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'comercios_amigos', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    },

    cliente_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'crm_clientes', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    funcion: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    creado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    }
  },
  {
    tableName: 'comercio_clientes',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_comercio_cliente', unique: true, fields: ["comercio_id", "cliente_id"] }
    ]
  }
);

export default ComercioClientesModel;
