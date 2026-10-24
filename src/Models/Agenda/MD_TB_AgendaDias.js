/* Benjamin Orellana - 20/10/2026 - Modelo agenda_dias de Mi agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AgendaDiasModel = db.define('agenda_dias', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'usuarios', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  frase: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
  prioridad_1_texto: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
  prioridad_1_cumplida: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  prioridad_2_texto: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
  prioridad_2_cumplida: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  prioridad_3_texto: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
  prioridad_3_cumplida: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
}, {
  tableName: 'agenda_dias', freezeTableName: true, timestamps: false,
  indexes: [
    {"name": "uq_agenda_dias_usuario_fecha", "fields": ["usuario_id", "fecha"], "unique": true},
    {"name": "uq_agenda_dias_id_usuario", "fields": ["id", "usuario_id"], "unique": true},
  ]
});
export default AgendaDiasModel;
