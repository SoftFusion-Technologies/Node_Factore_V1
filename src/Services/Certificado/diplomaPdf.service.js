/* Benjamin Orellana - 30/10/2026 - Diploma A4 horizontal con textos del registro original, sin QR ni código público. */
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { exigir } from '../../utils/validacion.utils.js';
import { fechaGuardada } from '../Acceso/permisoAcceso.service.js';

const asset = name => fileURLToPath(new URL('../../Assets/Certificado/v1/' + name, import.meta.url));
const azul = '#282d70', celeste = '#1699d2', claro = '#87c9eb';
const limpiar = text => String(text).normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/gu, ' ').trim();
function centrado(doc, text, font, max, min, x, y, width, height, color = azul) {
  doc.font(font);
  let size = max;
  while (size > min && (doc.fontSize(size).heightOfString(text, { width, lineGap: 3 }) > height
    || text.split(/\s+/u).some(word => doc.widthOfString(word) > width))) size--;
  doc.fontSize(size);
  exigir(doc.heightOfString(text, { width, lineGap: 3 }) <= height
    && !text.split(/\s+/u).some(word => doc.widthOfString(word) > width),
  409, 'CERTIFICADO_TEXTO_EXTENSO', 'El nombre o título necesita revisión antes de emitir.');
  doc.fillColor(color).text(text, x, y + (height - doc.heightOfString(text, { width, lineGap: 3 })) / 2,
    { width, align: 'center', lineGap: 3 });
}
function fragmento(doc, x, y, width, height) {
  // Se reutilizan solo el logo, sello y firma del diploma entregado por Juan; los textos se dibujan como PDF.
  doc.save().rect(x, y, width, height).clip().image(asset('diploma-referencia.png'), 0, 0, { width: 1123, height: 794 }).restore();
}
export async function generarDiploma(row) {
  exigir(row.plantilla_version === 1, 409, 'CERTIFICADO_PLANTILLA', 'La plantilla del certificado requiere revisión.');
  const fecha = fechaGuardada(row.emitido_en);
  exigir(Number.isFinite(fecha?.getTime()), 409, 'CERTIFICADO_FECHA', 'La fecha del certificado no es válida.');
  const nombre = limpiar(row.alumno_nombre), curso = limpiar(row.curso_titulo);
  const horas = String(row.carga_horaria).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1').replace('.', ',');
  const fechaTexto = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric', month: 'long', year: 'numeric' }).format(fecha);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: true,
    info: { Title: 'Certificado de finalización - Factor E', Author: 'Factor E Escuela de Negocios',
      Subject: curso, CreationDate: fecha, ModDate: fecha }, compress: true });
  const chunks = [];
  const completo = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  try {
    doc.registerFont('Texto', asset('DejaVuSans.ttf')).registerFont('Titulo', asset('DejaVuSans-Bold.ttf'))
      .registerFont('Nombre', asset('DejaVuSerif.ttf'));
    // Las coordenadas de la plantilla están en 1123 x 794; evitar el salto automático de texto tras escalar a puntos A4.
    doc.page.margins.bottom = -1000;
    doc.scale(doc.page.width / 1123, doc.page.height / 794);
    doc.rect(0, 0, 1123, 794).fill('#ffffff');
    doc.rect(40, 40, 1043, 714).lineWidth(0.8).stroke('#c8d5ed');
    for (const [n, color] of [[275, claro], [235, celeste], [160, azul]]) {
      doc.polygon([0, 0], [n, 0], [0, n]).fill(color);
      doc.polygon([1123, 794], [1123 - n, 794], [1123, 794 - n]).fill(color);
    }
    fragmento(doc, 503, 45, 118, 112);
    centrado(doc, 'D I P L O M A   D E   F I N A L I Z A C I Ó N', 'Titulo', 15, 12, 240, 176, 643, 28, '#1169a6');
    centrado(doc, 'Factor E Escuela de Negocios otorga el presente diploma a', 'Nombre', 21, 18, 170, 218, 783, 35);
    centrado(doc, nombre, 'Nombre', 56, 14, 148, 261, 827, 138);
    doc.moveTo(150, 416).lineTo(973, 416).lineWidth(1).stroke(celeste);
    centrado(doc, 'por haber completado el curso', 'Nombre', 22, 18, 170, 436, 783, 34);
    centrado(doc, curso, 'Titulo', 34, 12, 150, 478, 823, 68);
    centrado(doc, 'Con compromiso, dedicación y constancia recorrió el proceso de formación\ny se lleva herramientas concretas para seguir creciendo.',
      'Nombre', 19, 15, 230, 557, 663, 65);
    fragmento(doc, 501, 637, 122, 117);
    fragmento(doc, 696, 622, 279, 133);
    doc.font('Titulo').fontSize(10).fillColor('#50649a').text('FECHA DE EMISIÓN', 154, 674, { width: 310 });
    doc.font('Texto').fontSize(13).fillColor(azul).text(fechaTexto, 154, 690, { width: 310 });
    doc.font('Titulo').fontSize(10).fillColor('#50649a').text('CARGA HORARIA', 154, 716, { width: 310 });
    doc.font('Texto').fontSize(13).fillColor(azul).text(horas + (horas === '1' ? ' hora' : ' horas'), 154, 732, { width: 310 });
    doc.end();
  } catch (error) {
    doc.destroy();
    // El rechazo se consume también cuando un error sincrónico interrumpe el dibujo.
    completo.catch(() => {});
    throw error;
  }
  return completo;
}
