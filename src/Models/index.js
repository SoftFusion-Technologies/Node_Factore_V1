/* Benjamin Orellana - 24/10/2026 - Configuración y registro de certificados de curso. */
import CursoCertificadosModel from './Certificado/MD_TB_CursoCertificados.js';
/* Benjamin Orellana - 24/10/2026 - Integración de compra y habilitación de Mi agenda. */
import AgendaComprasModel from './Agenda/MD_TB_AgendaCompras.js';
/* Benjamin Orellana - 22/10/2026 - Configuración comercial de Mi agenda. */
import AgendaVentaConfiguracionModel from './Agenda/MD_TB_AgendaVentaConfiguracion.js';
import CompraPagosModel from './Compra/MD_TB_CompraPagos.js';
import ComprasModel from './Compra/MD_TB_Compras.js';
import CompraItemsModel from './Compra/MD_TB_CompraItems.js';
/* Benjamin Orellana - 20/10/2026 - Registro de los seis modelos de Mi agenda. */
import AgendaAccesosModel from './Agenda/MD_TB_AgendaAccesos.js';
import AgendaPreferenciasModel from './Agenda/MD_TB_AgendaPreferencias.js';
import AgendaDiasModel from './Agenda/MD_TB_AgendaDias.js';
import AgendaTareasModel from './Agenda/MD_TB_AgendaTareas.js';
import AgendaNotasModel from './Agenda/MD_TB_AgendaNotas.js';
import AgendaTiempoRegistrosModel from './Agenda/MD_TB_AgendaTiempoRegistros.js';
/* Factor E: registro de modelos. Las relaciones se inicializan desde relaciones.js. */

import ClientesModel from './Cliente/MD_TB_Clientes.js';
import UsuariosModel from './Usuario/MD_TB_Usuarios.js';
import ArchivosModel from './Archivo/MD_TB_Archivos.js';
import ComerciosAmigosModel from './Comercio/MD_TB_ComerciosAmigos.js';
import ComercioClientesModel from './Comercio/MD_TB_ComercioClientes.js';
import ClientesNotasModel from './Cliente/MD_TB_ClientesNotas.js';
import CursosModel from './Curso/MD_TB_Cursos.js';
import CursoModulosModel from './Curso/MD_TB_CursoModulos.js';
import CursoLeccionesModel from './Curso/MD_TB_CursoLecciones.js';
import CursoMaterialesModel from './Curso/MD_TB_CursoMateriales.js';
import CursoAccesosModel from './Acceso/MD_TB_CursoAccesos.js';
import CursoAccesoLeccionesModel from './Acceso/MD_TB_CursoAccesoLecciones.js';
import CursoAccesosHistorialModel from './Acceso/MD_TB_CursoAccesosHistorial.js';
import LeccionProgresoModel from './Campus/MD_TB_LeccionProgreso.js';
import UsuariosSesionesModel from './Usuario/MD_TB_UsuariosSesiones.js';
import UsuariosTokensModel from './Usuario/MD_TB_UsuariosTokens.js';
import AuditoriaEventosModel from './Sistema/MD_TB_AuditoriaEventos.js';
import ArchivosEliminacionesModel from './Archivo/MD_TB_ArchivosEliminaciones.js';

export {
  CursoCertificadosModel,
  AgendaVentaConfiguracionModel,
  AgendaAccesosModel, AgendaPreferenciasModel, AgendaDiasModel,
  AgendaTareasModel, AgendaNotasModel, AgendaTiempoRegistrosModel,
  ComprasModel, CompraItemsModel, CompraPagosModel,
  ClientesModel,
  UsuariosModel,
  ArchivosModel,
  ComerciosAmigosModel,
  ComercioClientesModel,
  ClientesNotasModel,
  CursosModel,
  CursoModulosModel,
  CursoLeccionesModel,
  CursoMaterialesModel,
  CursoAccesosModel,
  CursoAccesoLeccionesModel,
  CursoAccesosHistorialModel,
  LeccionProgresoModel,
  UsuariosSesionesModel,
  UsuariosTokensModel,
  AuditoriaEventosModel,
  ArchivosEliminacionesModel
};

export const modelos = {
  curso_certificados: CursoCertificadosModel,
  agenda_compras: AgendaComprasModel,
  agenda_venta_configuracion: AgendaVentaConfiguracionModel,
  agenda_accesos: AgendaAccesosModel,
  agenda_preferencias: AgendaPreferenciasModel,
  agenda_dias: AgendaDiasModel,
  agenda_tareas: AgendaTareasModel,
  agenda_notas: AgendaNotasModel,
  agenda_tiempo_registros: AgendaTiempoRegistrosModel,
  compras: ComprasModel, compra_items: CompraItemsModel, compra_pagos: CompraPagosModel,
  crm_clientes: ClientesModel,
  usuarios: UsuariosModel,
  archivos: ArchivosModel,
  comercios_amigos: ComerciosAmigosModel,
  comercio_clientes: ComercioClientesModel,
  clientes_notas: ClientesNotasModel,
  cursos: CursosModel,
  curso_modulos: CursoModulosModel,
  curso_lecciones: CursoLeccionesModel,
  curso_materiales: CursoMaterialesModel,
  curso_accesos: CursoAccesosModel,
  curso_acceso_lecciones: CursoAccesoLeccionesModel,
  curso_accesos_historial: CursoAccesosHistorialModel,
  leccion_progreso: LeccionProgresoModel,
  usuarios_sesiones: UsuariosSesionesModel,
  usuarios_tokens: UsuariosTokensModel,
  auditoria_eventos: AuditoriaEventosModel,
  archivos_eliminaciones: ArchivosEliminacionesModel
};
