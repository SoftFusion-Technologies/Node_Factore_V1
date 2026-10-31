/* Benjamin Orellana - 24/10/2026 - Diploma propio del alumno y curso; no genera emisiones automáticamente. */
import CursoCertificadosModel from './MD_TB_CursoCertificados.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';
import CursosModel from '../Curso/MD_TB_Cursos.js';

let inicializadas = false;
export function initCertificadoRelaciones() {
  if (inicializadas) return;
  for (const [target, key, alias] of [[UsuariosModel, 'usuario_id', 'usuario'], [CursosModel, 'curso_id', 'curso']]) {
    CursoCertificadosModel.belongsTo(target, { foreignKey: key, as: alias, constraints: false });
    target.hasMany(CursoCertificadosModel, { foreignKey: key, as: 'certificados', constraints: false });
  }
  inicializadas = true;
}
