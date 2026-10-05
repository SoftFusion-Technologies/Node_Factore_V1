/* Benjamin Orellana - 05/10/2026 - Transmisión privada por contenido habilitado. */
import { controladorArchivoCampus } from '../../Services/Campus/campusArchivo.service.js';
export const OBRS_VideoCampus_CTS = controladorArchivoCampus('video');
export const OBRS_PortadaCursoCampus_CTS = controladorArchivoCampus('portada_curso');
export const OBRS_PortadaLeccionCampus_CTS = controladorArchivoCampus('portada_leccion');
export const OBRS_MaterialCampus_CTS = controladorArchivoCampus('material');
export const OBRS_LogoComercioCampus_CTS = controladorArchivoCampus('logo_comercio');
