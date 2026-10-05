/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 04 / 10 / 2026
 * Versión: 1.0
 * Descripción: Modelo Sequelize de la tabla curso_accesos de Factor E.
 * Tema: Modelos - Acceso
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const CursoAccesosModel = db.define(
  'curso_accesos',
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

    curso_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'cursos', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    alcance: {
      type: DataTypes.ENUM('COMPLETO','SELECCION'),
      allowNull: false,
      defaultValue: "COMPLETO"
    },

    estado: {
      type: DataTypes.ENUM('ACTIVO','SUSPENDIDO','REVOCADO'),
      allowNull: false,
      defaultValue: "ACTIVO"
    },

    inicio_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    },

    vence_en: {
      type: DataTypes.DATE(3),
      allowNull: true
    },

    asignado_por: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },

    observaciones_internas: {
      type: DataTypes.TEXT,
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
    tableName: 'curso_accesos',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      { name: 'uq_accesos_usuario_curso', unique: true, fields: ["usuario_id", "curso_id"] },
      { name: 'uq_accesos_id_curso', unique: true, fields: ["id", "curso_id"] },
      { name: 'ix_accesos_vencimientos', unique: false, fields: ["estado", "vence_en"] },
      { name: 'ix_accesos_curso_estado', unique: false, fields: ["curso_id", "estado"] }
    ]
  }
);

export default CursoAccesosModel;
