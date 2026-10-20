/* Benjamin Orellana - 13/10/2026 - Compras de cursos de Factor E. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ComprasModel = db.define(
  'compras',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    referencia: { type: DataTypes.CHAR(36), allowNull: false },
    token_hash: { type: DataTypes.CHAR(64), allowNull: false },
    solicitud_hash: { type: DataTypes.CHAR(64), allowNull: false },
    comprador_nombre: { type: DataTypes.STRING(180), allowNull: false },
    comprador_email: { type: DataTypes.STRING(254), allowNull: false },
    usuario_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT'
    },
    estado: {
      type: DataTypes.ENUM('PENDIENTE', 'PAGADA', 'CANCELADA'),
      allowNull: false,
      defaultValue: 'PENDIENTE'
    },
    moneda: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'ARS' },
    total: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    vence_en: { type: DataTypes.DATE(3), allowNull: false },
    pagada_en: { type: DataTypes.DATE(3), allowNull: true },
    creado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    },
    mp_preferencia_estado: {
      type: DataTypes.ENUM(
        'SIN_CREAR',
        'CREANDO',
        'DISPONIBLE',
        'INCIERTA',
        'ERROR'
      ),
      allowNull: false,
      defaultValue: 'SIN_CREAR'
    },
    mp_preferencia_id: { type: DataTypes.STRING(180), allowNull: true },
    mp_checkout_url: { type: DataTypes.STRING(1000), allowNull: true },
    mp_error_codigo: { type: DataTypes.STRING(80), allowNull: true },
    actualizado_en: {
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: literal('CURRENT_TIMESTAMP(3)')
    }
  },
  {
    tableName: 'compras',
    freezeTableName: true,
    timestamps: false,
    defaultScope: { attributes: { exclude: ['token_hash', 'solicitud_hash'] } },
    scopes: { conHash: { attributes: { exclude: [] } } },
    indexes: [
      { name: 'uq_compras_referencia', unique: true, fields: ['referencia'] },
      { name: 'ix_compras_usuario', unique: false, fields: ['usuario_id'] },
      {
        name: 'ix_compras_estado_vence',
        unique: false,
        fields: ['estado', 'vence_en']
      }
    ]
  }
);
export default ComprasModel;
