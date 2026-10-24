/* Benjamin Orellana - 20/10/2026 - Modelo agenda_preferencias de Mi agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AgendaPreferenciasModel = db.define('agenda_preferencias', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
  tema: { type: DataTypes.ENUM('CLARO','OSCURO'), allowNull: false, defaultValue: "CLARO" },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
}, {
  tableName: 'agenda_preferencias', freezeTableName: true, timestamps: false,
  indexes: [
    {"name": "uq_agenda_preferencias_usuario", "fields": ["usuario_id"], "unique": true},
  ]
});
export default AgendaPreferenciasModel;
