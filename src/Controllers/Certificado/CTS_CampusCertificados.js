/* Benjamin Orellana - 30/10/2026 - Estado, primera emisión y PDF del alumno autenticado. */
import { alumno, controladorAlumno } from '../../Services/Campus/campusAcceso.service.js';
import { certificadoPropio } from '../../Services/Certificado/emisionCertificado.service.js';
import { responderError } from '../../utils/http.utils.js';
import { cookieSesion } from '../../Services/Usuario/configAuth.service.js';

export const OBRS_MiCertificado_CTS = controladorAlumno(async (req, session) => {
  const { data } = await certificadoPropio(req, session);
  return { data };
});
export const CR_MiCertificado_CTS = controladorAlumno(async (req, session) => {
  const { data, creado } = await certificadoPropio(req, session, { emitir: true });
  return { data, status: creado ? 201 : 200 };
});
export async function OBRS_PdfMiCertificado_CTS(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const session = await alumno(req);
    const { buffer } = await certificadoPropio(req, session, { pdf: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Certificado-Factor-E.pdf"');
    res.setHeader('Content-Length', buffer.length);
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).end(buffer);
  } catch (error) {
    if (error.status === 401) cookieSesion(res);
    return responderError(error, res);
  }
}
