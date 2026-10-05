/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla clientes_notas de Factor E.
 * Tema: Modelos - Cliente
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ClientesNotasModel = db.define(
  'clientes_notas',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    cliente_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'crm_clientes', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    contenido: {
      type: DataTypes.TEXT,
      allowNull: false
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
    tableName: 'clientes_notas',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'ix_notas_cliente_fecha', unique: false, fields: ["cliente_id", "creado_en"] }
    ]
  }
);

export default ClientesNotasModel;
