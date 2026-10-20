/* Benjamin Orellana - 13/10/2026 - Estado consultado a MP, sin datos de tarjeta. */
import db from '../../DataBase/db.js';
import { DataTypes, literal } from 'sequelize';
const CompraPagosModel = db.define('compra_pagos',{
  id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,primaryKey:true,autoIncrement:true},
  compra_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,references:{model:'compras',key:'id'},onDelete:'RESTRICT',onUpdate:'RESTRICT'},
  mp_pago_id:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false},
  estado:{type:DataTypes.STRING(40),allowNull:false},
  detalle_estado:{type:DataTypes.STRING(100),allowNull:true},
  validacion:{type:DataTypes.ENUM('VALIDADO','REVISION'),allowNull:false},
  motivo_revision:{type:DataTypes.STRING(80),allowNull:true},
  importe:{type:DataTypes.DECIMAL(14,2),allowNull:false},
  importe_reintegrado:{type:DataTypes.DECIMAL(14,2),allowNull:false,defaultValue:'0.00'},
  moneda:{type:DataTypes.STRING(10),allowNull:false},
  modo_prueba:{type:DataTypes.TINYINT.UNSIGNED,allowNull:false,defaultValue:1},
  mp_actualizado_en:{type:DataTypes.DATE(3),allowNull:false},
  aprobado_en:{type:DataTypes.DATE(3),allowNull:true},
  verificado_en:{type:DataTypes.DATE(3),allowNull:false},
  creado_en:{type:DataTypes.DATE(3),allowNull:false,defaultValue:literal('CURRENT_TIMESTAMP(3)')},
  actualizado_en:{type:DataTypes.DATE(3),allowNull:false,defaultValue:literal('CURRENT_TIMESTAMP(3)')},
},{tableName:'compra_pagos',freezeTableName:true,timestamps:false,indexes:[
  {name:'uq_compra_pagos_mp',unique:true,fields:['mp_pago_id']},
  {name:'ix_compra_pagos_compra',unique:false,fields:['compra_id']},
  {name:'ix_compra_pagos_revision',unique:false,fields:['validacion','verificado_en']}
]});
export default CompraPagosModel;
