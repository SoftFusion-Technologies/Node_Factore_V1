/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla curso_accesos_historial de Factor E.
 * Tema: Modelos - Acceso
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const CursoAccesosHistorialModel = db.define(
  'curso_accesos_historial',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },

    acceso_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'curso_accesos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    accion: {
      type: DataTypes.ENUM('ASIGNADO','RENOVADO','SUSPENDIDO','REACTIVADO','REVOCADO','ALCANCE_MODIFICADO','LECCION_MODIFICADA'),
      allowNull: false
    },

    realizado_por: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    motivo: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    datos_antes: {
      type: DataTypes.JSON,
      allowNull: true
    },

    datos_despues: {
      type: DataTypes.JSON,
      allowNull: true
    },

    creado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    }
  },
  {
    tableName: 'curso_accesos_historial',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'ix_acceso_historial_fecha', unique: false, fields: ["acceso_id", "creado_en"] }
    ]
  }
);

export default CursoAccesosHistorialModel;
