/* Benjamin Orellana - 05/11/2026 - Conexión personal de Google Calendar y estado OAuth de un solo uso. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const ocultos = ['refresh_cifrado', 'intento_cifrado'];
export default db.define('agenda_google_conexiones', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false,
    references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'RESTRICT' },
  refresh_cifrado: { type: DataTypes.TEXT, allowNull: true },
  intento_cifrado: { type: DataTypes.TEXT, allowNull: true },
  revision: { type: DataTypes.CHAR(36), allowNull: false },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
  actualizado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') }
}, {
  tableName: 'agenda_google_conexiones', freezeTableName: true, timestamps: false,
  defaultScope: { attributes: { exclude: ocultos } }, scopes: { conCredenciales: { attributes: { exclude: [] } } },
  indexes: [{ name: 'uq_agenda_google_usuario', unique: true, fields: ['usuario_id'] }]
});
