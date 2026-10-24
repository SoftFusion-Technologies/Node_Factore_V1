/* Benjamin Orellana - 24/10/2026 - Condiciones compradas y comprobante único de entrega de Agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const referencia = model => ({ type: DataTypes.BIGINT.UNSIGNED, allowNull: false,
  references: { model, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
const AgendaComprasModel = db.define('agenda_compras', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  compra_id: referencia('compras'),
  usuario_id: referencia('usuarios'),
  precio_unitario: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  moneda: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'ARS' },
  acceso_duracion_cantidad: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  acceso_duracion_unidad: { type: DataTypes.ENUM('DIAS','MESES','SIN_VENCIMIENTO'), allowNull: false },
  configuracion_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  entregada_en: { type: DataTypes.DATE(3), allowNull: true },
  acceso_id: { ...referencia('agenda_accesos'), allowNull: true },
  accion: { type: DataTypes.ENUM('ASIGNADO','RENOVADO','CONSERVADO'), allowNull: true },
  inicio_en: { type: DataTypes.DATE(3), allowNull: true },
  vence_en: { type: DataTypes.DATE(3), allowNull: true },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') }
}, { tableName: 'agenda_compras', freezeTableName: true, timestamps: false,
  indexes: [
    { name: 'uq_agenda_compras_compra', fields: ['compra_id'], unique: true },
    { name: 'ix_agenda_compras_usuario', fields: ['usuario_id'], unique: false },
    { name: 'ix_agenda_compras_acceso', fields: ['acceso_id'], unique: false }
  ]
});
export default AgendaComprasModel;
