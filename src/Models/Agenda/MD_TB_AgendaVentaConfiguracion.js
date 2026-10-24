/* Benjamin Orellana - 22/10/2026 - Precio y duración de las futuras compras de Mi agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AgendaVentaConfiguracionModel = db.define('agenda_venta_configuracion', {
  // Benjamin Orellana - 22/10/2026 - La configuración tiene una única fila con ID explícito 1.
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: false },
  precio: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: '0.00' },
  moneda: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'ARS' },
  acceso_duracion_cantidad: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: 1 },
  acceso_duracion_unidad: { type: DataTypes.ENUM('DIAS', 'MESES', 'SIN_VENCIMIENTO'), allowNull: false, defaultValue: 'MESES' },
  venta_habilitada: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  actualizado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true,
    references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') }
}, {
  tableName: 'agenda_venta_configuracion', freezeTableName: true, timestamps: false,
  indexes: [{ name: 'ix_agenda_venta_actualizado_por', fields: ['actualizado_por'], unique: false }]
});

export default AgendaVentaConfiguracionModel;
