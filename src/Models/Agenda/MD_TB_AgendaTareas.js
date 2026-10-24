/* Benjamin Orellana - 20/10/2026 - Modelo agenda_tareas de Mi agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AgendaTareasModel = db.define('agenda_tareas', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  dia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  texto: { type: DataTypes.STRING(2000), allowNull: false },
  categoria: { type: DataTypes.ENUM('OPERATIVO','COMERCIAL','ESTRATEGICO','PERSONAL'), allowNull: false },
  hora: { type: DataTypes.TIME, allowNull: true },
  prioridad: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 3 },
  recordatorio: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  recordada_en: { type: DataTypes.DATE(3), allowNull: true },
  completada: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  completada_en: { type: DataTypes.DATE(3), allowNull: true },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
}, {
  tableName: 'agenda_tareas', freezeTableName: true, timestamps: false,
  indexes: [
    {"name": "ix_agenda_tareas_dia_usuario", "fields": ["dia_id", "usuario_id"], "unique": false},
    {"name": "ix_agenda_tareas_usuario_hora", "fields": ["usuario_id", "recordatorio", "hora"], "unique": false},
  ]
});
export default AgendaTareasModel;
