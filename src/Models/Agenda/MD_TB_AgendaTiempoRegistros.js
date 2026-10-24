/* Benjamin Orellana - 20/10/2026 - Modelo agenda_tiempo_registros de Mi agenda. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const AgendaTiempoRegistrosModel = db.define('agenda_tiempo_registros', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  dia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  categoria: { type: DataTypes.ENUM('OPERATIVO','COMERCIAL','ESTRATEGICO','PERSONAL'), allowNull: false },
  inicio_en: { type: DataTypes.DATE(3), allowNull: false },
  fin_en: { type: DataTypes.DATE(3), allowNull: true },
  duracion_segundos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  en_curso: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true, defaultValue: 1 },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
}, {
  tableName: 'agenda_tiempo_registros', freezeTableName: true, timestamps: false,
  indexes: [
    {"name": "ix_agenda_tiempo_dia_usuario", "fields": ["dia_id", "usuario_id"], "unique": false},
    {"name": "uq_agenda_tiempo_abierto", "fields": ["usuario_id", "categoria", "en_curso"], "unique": true},
  ]
});
export default AgendaTiempoRegistrosModel;
