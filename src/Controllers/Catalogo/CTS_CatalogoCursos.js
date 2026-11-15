/* Benjamin Orellana - 13/10/2026 - Catálogo público de cursos: solo datos comerciales. */
import { Op } from 'sequelize';
import CursosModel from '../../Models/Curso/MD_TB_Cursos.js';
import { servirArchivo } from '../../Services/Archivo/contenidoArchivo.service.js';
import { ErrorHttp, exigir } from '../../utils/validacion.utils.js';
import { serializar, responderError } from '../../utils/http.utils.js';

const atributosPublicos = [
  'id', 'slug', 'titulo', 'descripcion_corta', 'descripcion',
  'precio', 'moneda', 'modalidad', 'orden', 'estado', 'portada_archivo_id',
  'venta_online_habilitada', 'acceso_duracion_cantidad', 'acceso_duracion_unidad'
];

// Benjamin Orellana - 18/10/2026 - Publicar condiciones comerciales sin exponer estados internos.
function presentarCurso(row) {
  const data = row.get({ plain: true });
  const { estado, venta_online_habilitada, portada_archivo_id, ...publico } = data;
  return { ...publico, tiene_portada: portada_archivo_id != null,
    compra_online_disponible: estado === 'PUBLICADO' &&
    venta_online_habilitada === 1 && publico.moneda === 'ARS' &&
    typeof publico.precio === 'string' && /^\d+(?:\.\d{1,2})?$/.test(publico.precio) &&
    BigInt(publico.precio.replace('.', '').replace(/^0+/, '') || '0') > 0n };
}

// La visibilidad comercial es independiente de publicar videos en el campus.
// Un curso visible en BORRADOR puede ofrecerse en la web; ARCHIVADO queda oculto.
const filtroPublico = { visible_catalogo: 1, estado: { [Op.ne]: 'ARCHIVADO' } };

function consultaPublica(operacion) {
  return async (req, res) => {
    try {
      exigir(Object.keys(req.query || {}).length === 0, 422,
        'CATALOGO_INVALIDO', 'Esta consulta no admite filtros libres.');
      const resultado = await operacion(req);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(serializar(resultado));
    } catch (error) { return responderError(error, res); }
  };
}

export const OBRS_CatalogoCursos_CTS = consultaPublica(async () => {
  const data = await CursosModel.findAll({
    attributes: atributosPublicos,
    where: filtroPublico,
    order: [['orden', 'ASC'], ['id', 'ASC']]
  });
  return { data: data.map(presentarCurso) };
});

export const OBRS_CatalogoCurso_CTS = consultaPublica(async req => {
  const slug = slugCatalogo(req);
  const data = await CursosModel.findOne({
    attributes: atributosPublicos,
    where: { ...filtroPublico, slug }
  });
  exigir(data, 404, 'CURSO_NO_ENCONTRADO', 'El curso no está disponible en el catálogo.');
  return { data: presentarCurso(data) };
});

function slugCatalogo(req) {
  const slug = req.params.slug;
  exigir(typeof slug === 'string' && slug.length <= 180 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 422,
  'CATALOGO_INVALIDO', 'El identificador del curso no es válido.');
  return slug;
}

// Benjamin Orellana - 15/11/2026 - Servir solo la portada asociada a un curso visible.
async function portadaCatalogo(slug, archivoId) {
  const curso = await CursosModel.findOne({
    attributes: ['id'],
    where: { ...filtroPublico, slug, ...(archivoId === undefined ? {} : { portada_archivo_id: archivoId }) },
    include: [{ association: 'portada', required: true,
      attributes: ['id', 'tipo', 'estado', 'extension', 'mime_type', 'ruta_relativa', 'tamanio_bytes'],
      where: { tipo: 'IMAGEN', estado: 'DISPONIBLE', ruta_relativa: { [Op.like]: 'imagenes/%' } } }]
  });
  return curso?.portada;
}

export async function OBRS_PortadaCatalogoCurso_CTS(req, res) {
  try {
    exigir(Object.keys(req.query || {}).length === 0, 422,
      'CATALOGO_INVALIDO', 'Esta consulta no admite filtros libres.');
    const slug = slugCatalogo(req), portada = await portadaCatalogo(slug);
    exigir(portada, 404, 'PORTADA_NO_DISPONIBLE', 'La portada no está disponible.');
    await servirArchivo(req, res, { ...portada.get({ plain: true }), nombre_original: 'portada.' + portada.extension }, {
      vigente: async () => Boolean(await portadaCatalogo(slug, portada.id))
    });
  } catch (error) {
    if (res.headersSent || res.destroyed) { if (!res.destroyed) res.destroy(); return; }
    for (const name of ['Content-Length', 'Content-Range', 'Content-Disposition', 'Accept-Ranges', 'Content-Type']) res.removeHeader(name);
    const noDisponible = ['ARCHIVO_NO_DISPONIBLE', 'ARCHIVO_INCONSISTENTE', 'ACCESO_NO_VIGENTE'].includes(error.code);
    return responderError(noDisponible ? new ErrorHttp(404, 'PORTADA_NO_DISPONIBLE', 'La portada no está disponible.') : error, res);
  }
}
