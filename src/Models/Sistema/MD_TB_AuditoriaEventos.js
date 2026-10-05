/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla auditoria_eventos de Factor E.
 * Tema: Modelos - Sistema
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AuditoriaEventosModel = db.define(
  'auditoria_eventos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    accion: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    entidad: {
      type: DataTypes.STRING(80),
      allowNull: false
    },

    entidad_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },

    detalle: {
      type: DataTypes.JSON,
      allowNull: true
    },

    ip: {
      type: DataTypes.STRING(45),
      allowNull: true
    },

    creado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    }
  },
  {
    tableName: 'auditoria_eventos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'ix_auditoria_entidad_fecha', unique: false, fields: ["entidad", "entidad_id", "creado_en"] },
      { name: 'ix_auditoria_usuario_fecha', unique: false, fields: ["usuario_id", "creado_en"] }
    ]
  }
);

export default AuditoriaEventosModel;
