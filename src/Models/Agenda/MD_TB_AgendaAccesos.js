/* Benjamin Orellana - 20/10/2026 - Modelo agenda_accesos de Mi agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AgendaAccesosModel = db.define('agenda_accesos', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
  estado: { type: DataTypes.ENUM('ACTIVO','SUSPENDIDO','REVOCADO'), allowNull: false, defaultValue: "REVOCADO" },
  inicio_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  vence_en: { type: DataTypes.DATE(3), allowNull: true },
  otorgado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
  motivo: { type: DataTypes.STRING(500), allowNull: true },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
}, {
  tableName: 'agenda_accesos', freezeTableName: true, timestamps: false,
  indexes: [
    {"name": "uq_agenda_accesos_usuario", "fields": ["usuario_id"], "unique": true},
    {"name": "ix_agenda_accesos_otorgado", "fields": ["otorgado_por"], "unique": false},
    {"name": "ix_agenda_accesos_estado_vence", "fields": ["estado", "vence_en"], "unique": false},
  ]
});
export default AgendaAccesosModel;
