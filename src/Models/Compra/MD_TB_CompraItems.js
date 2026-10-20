/* Benjamin Orellana - 13/10/2026 - Compras de cursos de Factor E. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const CompraItemsModel = db.define('compra_items', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  compra_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'compras', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
  curso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'cursos', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
  titulo: { type: DataTypes.STRING(180), allowNull: false },
  slug: { type: DataTypes.STRING(180), allowNull: false },
  precio_unitario: { type: DataTypes.DECIMAL(14,2), allowNull: false },
  moneda: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: "ARS" },
  acceso_duracion_cantidad: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  acceso_duracion_unidad: { type: DataTypes.ENUM('DIAS','MESES'), allowNull: false },
  creado_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') },
}, { tableName: 'compra_items', freezeTableName: true, timestamps: false,
  indexes: [{"name": "uq_compra_items_curso", "unique": true, "fields": ["compra_id", "curso_id"]}, {"name": "ix_compra_items_curso", "unique": false, "fields": ["curso_id"]}]
});
export default CompraItemsModel;
