# Catálogo público — paso 1

Este parche incorpora dos consultas públicas sobre la tabla `cursos` existente:

- `GET /api/catalogo/cursos` → `{ "data": [...] }`.
- `GET /api/catalogo/cursos/:slug` → `{ "data": {...} }`.

Campos: id, slug, titulo, descripcion_corta, descripcion, precio, moneda,
modalidad y orden. Los IDs y precios se conservan como cadenas. Se ordena por
orden e ID, sin limitar implícitamente a 100 registros.

La condición comercial es `visible_catalogo = 1 AND estado <> 'ARCHIVADO'`.
Un borrador marcado visible puede ofrecerse en la web sin publicar videos en
el campus. Las rutas del campus mantienen sus reglas de acceso actuales.

Este paso no modifica tablas ni datos, no retira cursos de demo ni agrega el
Kit, y todavía no cambia las tarjetas del frontend. Esas tareas se realizan
después de verificar la respuesta de estas consultas.

El ZIP contiene ocho archivos incrementales de Node_Factore_V1. No contiene
.env, dependencias ni cambios del frontend. Conserva una copia de src, Scripts,
Tests y docs antes de extraerlo.

Validación local: `node --test Tests/catalogo-publico.test.js` y
`npm run rutas:verificar`. Las pruebas usan HTTP real y un adaptador SQLite;
no abren una conexión a MySQL DESA. Para verificar MySQL con el servidor
levantado, consultá `curl -i http://127.0.0.1:3001/api/catalogo/cursos`.
