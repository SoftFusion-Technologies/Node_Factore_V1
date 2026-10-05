# Factor E — Etapa 2B: controladores de contenido

Parche incremental para la estructura `Node_Factore_V1/src`. Requiere las etapas 1 y 2A ya instaladas. Compatible con Node 18.16.0 y los paquetes existentes; no modifica `package.json`, `.env`, modelos, relaciones ni esquema MySQL. No ejecutar `sync()`, `alter` ni reinstalar el SQL.

## Archivos del módulo

- `src/Controllers/Curso/CTS_TB_Cursos.js`: 5 funciones.
- `src/Controllers/Curso/CTS_TB_CursoModulos.js`: 5 funciones.
- `src/Controllers/Curso/CTS_TB_CursoLecciones.js`: 6 funciones, incluido `ER_VideoLeccion_CTS`.
- `src/Controllers/Curso/CTS_TB_CursoMateriales.js`: 5 funciones.
- `src/Services/Curso/contenido.service.js`: validación de precio, pertenencia y transacciones auditadas.
- `src/Services/Archivo/archivoReferencias.service.js`: referencias, cola, borrado físico y reintentos.
- `src/Services/Sistema/auditoria.service.js`: admite opciones de transacción; conserva el contrato de la etapa 2A.
- Dos scripts, pruebas y fixture aislado de las 18 tablas. El adaptador de pruebas conserva su fixture CRM por defecto.

Esta entrega contiene controladores invocables con `req`/`res`. Las rutas, el servidor HTTP, la autenticación, la subida y la reproducción de archivos se incorporan en las próximas etapas. `req.user.id` será establecido por el middleware de sesión; jamás se debe construir desde el cuerpo, la query o cabeceras libres. Cada controlador comprueba en la base que esa cuenta esté activa y sea ADMIN, y las escrituras lo vuelven a comprobar dentro de la transacción.

## Contrato de los controladores

Las funciones usan los prefijos habituales `OBRS_` (listado/detalle), `CR_` (crear), `UR_` (editar) y `ER_` (archivar/eliminar según entidad), terminados en `_CTS`. Los nombres completos se encuentran en `Scripts/verificar-controladores-cursos.js`.

| Entidad | Parámetros requeridos | Campos de creación/edición |
| --- | --- | --- |
| Curso | `params.id` para detalle, edición y archivo | `titulo`, `slug`, `descripcion_corta`, `descripcion`, `portada_archivo_id`, `precio`, `moneda`, `modalidad`, `estado`, `visible_catalogo`, `orden` |
| Módulo | Siempre `params.curso_id`; además `params.id` para detalle, edición y archivo | `titulo`, `descripcion`, `estado`, `orden` |
| Lección | Siempre `params.curso_id`; además `params.id` para detalle, edición, archivo y retiro de video | `modulo_id`, `titulo`, `descripcion`, `video_archivo_id`, `portada_archivo_id`, `estado`, `orden` |
| Material | Siempre `params.curso_id`; además `params.id` para detalle, edición y eliminación | `leccion_id`, `archivo_id`, `titulo`, `activo`, `orden` |

En creación: `titulo` siempre es obligatorio; lección requiere `modulo_id`; material requiere `archivo_id`. El curso genera `slug` desde el título si no se indica. `creado_por` procede de la cuenta autenticada. No aceptar `curso_id` en el cuerpo de los hijos: lo determina su parámetro padre. Una lección puede moverse entre módulos del mismo curso; un material puede cambiar entre general (`leccion_id:null`) y una lección del mismo curso.

Ediciones parciales conservan campos omitidos. Se admite `null` para limpiar descripciones, portada, video, precio y `leccion_id`, cuando corresponda; un material siempre necesita `archivo_id`. No aceptar campos desconocidos, cuerpos vacíos en edición, IDs con SQL o números fuera de precisión segura. Enviar IDs BIGINT como texto. `orden` es entero de 0 a 4294967295. Banderas en cuerpo: `true`, `false`, `0`, `1`; filtros también admiten sus representaciones textuales.

`precio` es nullable o decimal positivo/cero de hasta 12 cifras enteras y 2 decimales; se normaliza a dos decimales y se recomienda enviarlo como texto. `moneda` se normaliza a tres letras mayúsculas. Los estados y modalidades respetan los ENUM instalados. Las descripciones de módulos/lecciones admiten hasta 50000 caracteres y 60000 bytes UTF-8; la descripción LONGTEXT del curso admite hasta 50000 caracteres.

Las operaciones `ER_` reciben cuerpo vacío o ausente. Respuestas: `{data}`, con `message` para escrituras y `meta` para listados. Fechas UTC ISO terminadas en Z, IDs como texto; nunca devolver rutas de almacenamiento, nombres internos ni hashes. Creación 201; edición/archivo/borrado completo 200; operación confirmada con eliminación física pendiente 202 y `eliminaciones:[{id,estado}]`. El estado 202 significa que la asociación ya fue modificada y el alumno perdió ese vínculo; falta completar el borrado del disco. No repetir la creación/eliminación como compensación: reintentar su trabajo pendiente.

Errores: 401 sin cuenta activa, 403 sin rol ADMIN, 404 entidad inexistente o fuera del curso, 409 duplicados/curso archivado/concurrencia, 422 datos o referencias de contenido inválidas, 500 genérico sin detalles internos.

## Listados

Devuelven todos los resultados por defecto. La paginación se activa únicamente con `pagina` o `por_pagina`; máximo 500 por página. Query común: `q`, `pagina`, `por_pagina`, `ordenar_por`, `direccion` (`ASC`/`DESC`). Búsqueda vacía equivale a no filtrar. Orden por defecto: `orden`, luego `id`. No aceptar columnas libres.

| Listado | Filtros adicionales | Columnas de orden |
| --- | --- | --- |
| Cursos | `estado`, `modalidad`, `visible_catalogo` | `id`, `titulo`, `orden`, `creado_en`, `actualizado_en` |
| Módulos | `estado` | Las mismas |
| Lecciones | `estado`, `modulo_id` del curso | Las mismas |
| Materiales | `activo`, `leccion_id` del curso, `generales=true` | `id`, `titulo`, `orden`, `creado_en` |

`generales=true` selecciona materiales con `leccion_id IS NULL` y no se combina con `leccion_id`. Los listados/detalles de cursos, lecciones y materiales incluyen los metadatos seguros de sus archivos; no incluyen enlaces públicos de reproducción.

## Publicación y archivo

1. Crear el curso en BORRADOR (PUBLICADO se rechaza al crearlo).
2. Crear sus módulos; agregar lecciones y asociar un video DISPONIBLE.
3. Publicar la lección: requiere módulo ACTIVO, curso no ARCHIVADO y video físico existente de tipo VIDEO.
4. Publicar el curso: requiere al menos una lección PUBLICADA de un módulo ACTIVO con video físico disponible.

Las portadas requieren IMAGEN, los materiales DOCUMENTO. No basta un ID de metadatos si el archivo está SUBIENDO, pendiente/eliminado, falta en disco o su ruta no es segura. Esta etapa asocia archivos ya disponibles; su creación mediante subida se implementará en el módulo Archivo.

`ER_Curso_CTS`, `ER_CursoModulo_CTS` y `ER_CursoLeccion_CTS` archivan. Conservan asociaciones, archivos, permisos, historial y progreso, y las vistas del campus ya excluyen contenido archivado. Reactivar requiere editar el estado; publicar vuelve a validar disponibilidad. No agregar hijos nuevos a un curso archivado.

`ER_VideoLeccion_CTS` retira exclusivamente su video. También se puede editar `video_archivo_id:null`; si estaba PUBLICADA y no se indica un estado, pasa a BORRADOR. Publicar explícitamente sin video se rechaza. Retirar el último video no cambia automáticamente el estado del curso, pero esas lecciones dejan de estar habilitadas en las vistas; publicar el curso de nuevo sin contenido válido se rechaza. El progreso conserva su lección y posición.

Desactivar un material (`activo:false`) conserva su archivo. `ER_CursoMaterial_CTS` elimina la asociación de material y evalúa su borrado físico. Para borrar una portada, editar su `portada_archivo_id:null`. Reemplazar un archivo aplica la misma evaluación al anterior.

## Eliminación física y concurrencia

Antes de asociar/quitar un archivo, bloquear sus metadatos en orden numérico de ID. Todas las futuras escrituras de referencias del módulo Archivo/Comercio deben reutilizar este protocolo. Las transacciones de contenido trabajan en READ COMMITTED: el conteo posterior a esos bloqueos ve las referencias confirmadas más recientes. SQLite de pruebas no verifica los bloqueos reales ni la concurrencia de MySQL.

Se cuentan las cinco referencias: portadas de cursos, videos y portadas de lecciones, materiales y logos de comercios, incluyendo contenido archivado/inactivo. Si hay otra referencia, se conserva el archivo. Al quitar la última, en la misma transacción se marca PENDIENTE_ELIMINACION y se crea una operación única en `archivos_eliminaciones`, junto con la auditoría.

Después del commit se intenta borrar del servidor. El proceso vuelve a comprobar referencias, reclama el trabajo, valida la ruta privada y ejecuta `unlink`. Solo entonces confirma archivo ELIMINADO y trabajo COMPLETADA. Si el proceso cae tras `unlink`, el reintento admite un archivo ya ausente y termina la confirmación. Si falla el borrado, queda ERROR con reintento después de un minuto; se recuperan trabajos EN_PROCESO sin actividad durante diez minutos. Conservamos sus metadatos como comprobante.

Rutas admitidas: `videos/UUID.ext`, `imagenes/UUID.ext`, `documentos/UUID.ext`. La raíz y sus subcarpetas deben existir y ser directorios reales; el archivo debe ser regular. No seguir enlaces simbólicos ni admitir rutas arbitrarias. Por defecto la raíz es `../factore-storage-desa` respecto a la carpeta del proyecto; puede configurarse `STORAGE_ROOT` en el `.env`. Una carpeta mal configurada provoca un trabajo pendiente/error, nunca un falso borrado completado. No publicar esa carpeta como estáticos.

Reintento manual cuando exista almacenamiento real:

```bash
cd ~/Node_Factore_V1
node Scripts/reintentar-eliminaciones.js
```

Este script sí usa la base y almacenamiento configurados; no recrea tablas. Su salida muestra IDs y estados, sin rutas o contenido. Código de salida 1 ante error o si algún trabajo procesado no se completa. No procesa errores cuyo próximo intento aún no llegó. La programación automática/arranque del trabajador se conectará en una etapa posterior.

## Verificación

```bash
cd ~/Node_Factore_V1
node Scripts/verificar-controladores-cursos.js
node --test Tests/*.test.js
npm run modelos:verificar
```

Importaciones esperadas: 4 archivos, 21 funciones y 18 modelos. Pruebas en Node 18.16.0: 12 casos del CRM previo y 13 del contenido, con Sequelize generando SQL MySQL, adaptador SQLite aislado y archivos temporales reales. No utilizan MySQL DESA ni su almacenamiento; no validan collation, precisión DECIMAL, bloqueos de servidor o carreras reales de MySQL. El esquema instalado ya fue comprobado por `modelos:db`; la prueba funcional contra MySQL se completará al integrar el servidor y las rutas.

No se realizó un build. No hay servidor para iniciar en esta etapa.
