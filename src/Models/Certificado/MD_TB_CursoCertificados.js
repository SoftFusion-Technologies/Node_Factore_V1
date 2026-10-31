/* Benjamin Orellana - 24/10/2026 - Registro único de diploma y datos congelados en su primera emisión. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';

const referencia = model => ({ type: DataTypes.BIGINT.UNSIGNED, allowNull: false,
  references: { model, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });

const CursoCertificadosModel = db.define('curso_certificados', {
  id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, primaryKey: true, autoIncrement: true },
  usuario_id: referencia('usuarios'),
  curso_id: referencia('cursos'),
  alumno_nombre: { type: DataTypes.STRING(180), allowNull: false },
  curso_titulo: { type: DataTypes.STRING(180), allowNull: false },
  carga_horaria: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  lecciones_requeridas: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  lecciones_completadas: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  plantilla_version: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
  emitido_en: { type: DataTypes.DATE(3), allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP(3)') }
}, {
  tableName: 'curso_certificados', freezeTableName: true, timestamps: false,
  indexes: [
    { name: 'uq_certificado_usuario_curso', fields: ['usuario_id', 'curso_id'], unique: true },
    { name: 'ix_certificados_curso', fields: ['curso_id'], unique: false }
  ]
});

export default CursoCertificadosModel;
