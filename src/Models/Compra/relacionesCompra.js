import CompraPagosModel from './MD_TB_CompraPagos.js';
/* Benjamin Orellana - 13/10/2026 - Relaciones de compras. */
import ComprasModel from './MD_TB_Compras.js';
import CompraItemsModel from './MD_TB_CompraItems.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';
import CursosModel from '../Curso/MD_TB_Cursos.js';
let initialized=false;
export function initCompraRelaciones() {
  if(initialized)return;
  UsuariosModel.hasMany(ComprasModel,{foreignKey:'usuario_id',as:'compras',constraints:false});
  ComprasModel.belongsTo(UsuariosModel,{foreignKey:'usuario_id',as:'usuario',constraints:false});
  ComprasModel.hasMany(CompraItemsModel,{foreignKey:'compra_id',as:'items',constraints:false});
  CompraItemsModel.belongsTo(ComprasModel,{foreignKey:'compra_id',as:'compra',constraints:false});
  CursosModel.hasMany(CompraItemsModel,{foreignKey:'curso_id',as:'compras_items',constraints:false});
  CompraItemsModel.belongsTo(CursosModel,{foreignKey:'curso_id',as:'curso',constraints:false});
  ComprasModel.hasMany(CompraPagosModel,{foreignKey:'compra_id',as:'pagos',constraints:false});
  CompraPagosModel.belongsTo(ComprasModel,{foreignKey:'compra_id',as:'compra',constraints:false});
  initialized=true;
}
