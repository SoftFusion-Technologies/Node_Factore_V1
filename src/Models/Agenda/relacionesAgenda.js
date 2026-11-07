import AgendaGoogleModel from './MD_TB_AgendaGoogleConexiones.js';
import AgendaComprasModel from './MD_TB_AgendaCompras.js';
import ComprasModel from '../Compra/MD_TB_Compras.js';
/* Benjamin Orellana - 20/10/2026 - Relaciones de Mi agenda, sin sincronizar el esquema. */
import AgendaVentaConfiguracionModel from './MD_TB_AgendaVentaConfiguracion.js';
import UsuariosModel from '../Usuario/MD_TB_Usuarios.js';
import AgendaAccesosModel from './MD_TB_AgendaAccesos.js';
import AgendaPreferenciasModel from './MD_TB_AgendaPreferencias.js';
import AgendaDiasModel from './MD_TB_AgendaDias.js';
import AgendaTareasModel from './MD_TB_AgendaTareas.js';
import AgendaNotasModel from './MD_TB_AgendaNotas.js';
import AgendaTiempoRegistrosModel from './MD_TB_AgendaTiempoRegistros.js';

let relacionesInicializadas = false;

export function initAgendaRelaciones() {
  if (relacionesInicializadas) return;

  // Benjamin Orellana - 05/11/2026 - Una conexión de Google por cuenta de Factor E.
  UsuariosModel.hasOne(AgendaGoogleModel, { foreignKey: 'usuario_id', as: 'agenda_google', constraints: false });
  AgendaGoogleModel.belongsTo(UsuariosModel, { foreignKey: 'usuario_id', as: 'usuario', constraints: false });

  // Los permisos de lectura/escritura se implementarán en servicios y rutas.
  // Estas asociaciones no sustituyen el filtro del usuario autenticado.
  UsuariosModel.hasOne(AgendaAccesosModel, {
    foreignKey: 'usuario_id', as: 'agenda_acceso', constraints: false
  });
  AgendaAccesosModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id', as: 'usuario', constraints: false
  });
  UsuariosModel.hasMany(AgendaAccesosModel, {
    foreignKey: 'otorgado_por', as: 'agenda_accesos_otorgados', constraints: false
  });
  AgendaAccesosModel.belongsTo(UsuariosModel, {
    foreignKey: 'otorgado_por', as: 'otorgante', constraints: false
  });
  UsuariosModel.hasOne(AgendaPreferenciasModel, {
    foreignKey: 'usuario_id', as: 'agenda_preferencias', constraints: false
  });
  AgendaPreferenciasModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id', as: 'usuario', constraints: false
  });
  UsuariosModel.hasMany(AgendaDiasModel, {
    foreignKey: 'usuario_id', as: 'agenda_dias', constraints: false
  });
  AgendaDiasModel.belongsTo(UsuariosModel, {
    foreignKey: 'usuario_id', as: 'usuario', constraints: false
  });

  for (const [modelo, alias] of [
    [AgendaTareasModel, 'tareas'],
    [AgendaNotasModel, 'notas'],
    [AgendaTiempoRegistrosModel, 'tiempo_registros']
  ]) {
    UsuariosModel.hasMany(modelo, {
      foreignKey: 'usuario_id', as: 'agenda_' + alias, constraints: false
    });
    modelo.belongsTo(UsuariosModel, {
      foreignKey: 'usuario_id', as: 'usuario', constraints: false
    });
    AgendaDiasModel.hasMany(modelo, {
      foreignKey: 'dia_id', as: alias, constraints: false
    });
    modelo.belongsTo(AgendaDiasModel, {
      foreignKey: 'dia_id', as: 'dia', constraints: false
    });
  }

  // MySQL comprueba conjuntamente (dia_id, usuario_id). Sequelize usa el id,
  // que es único; constraints:false evita reemplazar la FK compuesta.
  // Benjamin Orellana - 22/10/2026 - Autor del cambio comercial; no relaciona contenido privado.
  AgendaVentaConfiguracionModel.belongsTo(UsuariosModel, {
    foreignKey: 'actualizado_por', as: 'editor', constraints: false
  });
  UsuariosModel.hasMany(AgendaVentaConfiguracionModel, {
    foreignKey: 'actualizado_por', as: 'agenda_configuraciones_editadas', constraints: false
  });
  // Benjamin Orellana - 24/10/2026 - Compra y comprobante sin relacionar textos privados.
  for (const [target, key, alias, inverse] of [
    [ComprasModel, 'compra_id', 'compra', 'agenda_compras'],
    [UsuariosModel, 'usuario_id', 'usuario', 'compras_agenda'],
    [AgendaAccesosModel, 'acceso_id', 'acceso', 'compras']
  ]) {
    AgendaComprasModel.belongsTo(target, { foreignKey: key, as: alias, constraints: false });
    target.hasMany(AgendaComprasModel, { foreignKey: key, as: inverse, constraints: false });
  }
  relacionesInicializadas = true;
}
