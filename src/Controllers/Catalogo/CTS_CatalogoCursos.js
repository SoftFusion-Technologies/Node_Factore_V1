/* Benjamin Orellana - 13/10/2026 - Catálogo público de cursos: solo datos comerciales. */
import { Op } from 'sequelize';
import CursosModel from '../../Models/Curso/MD_TB_Cursos.js';
import { exigir } from '../../utils/validacion.utils.js';
import { serializar, responderError } from '../../utils/http.utils.js';

const atributosPublicos = [
  'id', 'slug', 'titulo', 'descripcion_corta', 'descripcion',
  'precio', 'moneda', 'modalidad', 'orden', 'estado',
  'venta_online_habilitada', 'acceso_duracion_cantidad', 'acceso_duracion_unidad'
];

// Benjamin Orellana - 18/10/2026 - Publicar condiciones comerciales sin exponer estados internos.
function presentarCurso(row) {
  const data = row.get({ plain: true });
  const { estado, venta_online_habilitada, ...publico } = data;
  return { ...publico, compra_online_disponible: estado === 'PUBLICADO' &&
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
  const slug = req.params.slug;
  exigir(typeof slug === 'string' && slug.length <= 180 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 422,
  'CATALOGO_INVALIDO', 'El identificador del curso no es válido.');
  const data = await CursosModel.findOne({
    attributes: atributosPublicos,
    where: { ...filtroPublico, slug }
  });
  exigir(data, 404, 'CURSO_NO_ENCONTRADO', 'El curso no está disponible en el catálogo.');
  return { data: presentarCurso(data) };
});
