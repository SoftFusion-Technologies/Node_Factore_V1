/* Benjamin Orellana - 20/10/2026 - Modelo agenda_notas de Mi agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AgendaNotasModel = db.define('agenda_notas', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  dia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  texto: { type: DataTypes.STRING(4000), allowNull: false },
  cumplida: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  orden: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
}, {
  tableName: 'agenda_notas', freezeTableName: true, timestamps: false,
  indexes: [
    {"name": "ix_agenda_notas_dia_usuario", "fields": ["dia_id", "usuario_id"], "unique": false},
    {"name": "ix_agenda_notas_usuario_orden", "fields": ["usuario_id", "dia_id", "orden", "id"], "unique": false},
  ]
});
export default AgendaNotasModel;
