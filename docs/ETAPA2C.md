# Factor E — Etapa 2C: archivos privados

Parche incremental sobre etapas 1, 2A y 2B. Mantiene `src/Controllers/Archivo/CTS_TB_Archivos.js`, modelos `MD_TB_*`, ES modules y Sequelize. Compatible con Node 18.16.0; no incluye un servidor, rutas productivas ni cambios de esquema. No ejecutar `sync()` ni reinstalar el SQL. No modifica `.env` ni incluye README.

## Qué agrega

Un controlador con siete funciones, servicios de subida, formatos, rutas privadas, lectura por streaming y recuperación de cargas. Centraliza las rutas que ya utilizaba `archivoReferencias.service.js` y exporta el manejador de errores existente para la respuesta de streaming. La recuperación interna puede descartar archivos SUBIENDO; el borrado administrativo sigue rechazando una carga en curso.

Actualiza `package.json` y su lock para agregar `busboy@1.6.0` y `yauzl@3.4.0`, manteniendo las dependencias y el override anteriores. Se requiere `npm ci`. Agrega scripts de verificación, inicialización y recuperación. No se realizó un build.

## Almacenamiento

Los binarios se guardan en el servidor privado; MySQL conserva sus metadatos, referencias, estado y SHA256. Por defecto: `~/factore-storage-desa` cuando el proyecto está en `~/Node_Factore_V1`. La ruta se resuelve respecto al proyecto, sin depender del directorio de ejecución.

Se crean `videos`, `imagenes`, `documentos` y `.tmp`, con permiso 0700 en nuevas carpetas y 0600 para archivos. La lectura y el borrado rechazan symlinks y rutas arbitrarias. El servidor debe ejecutarse con un usuario que tenga acceso a esas carpetas. No montarlas como contenido público de Express/Nginx ni incluirlas en Git.

No es necesario editar tu `.env`. Opcionalmente se pueden agregar estos valores; son los predeterminados:

```dotenv
STORAGE_ROOT=../factore-storage-desa
MAX_VIDEO_BYTES=1073741824
MAX_IMAGE_BYTES=10485760
MAX_DOCUMENT_BYTES=26214400
UPLOAD_TIMEOUT_MS=1800000
```

Videos: 1 GiB; imágenes: 10 MiB; documentos: 25 MiB; tiempo de carga: 30 minutos. Los límites pueden configurarse entre 1 byte y 10 GiB; el timeout entre 1 segundo y 2 horas. Se admite hasta 64 KiB adicionales para la envoltura multipart. Son límites de archivos, no recortes de listados. No cambiar STORAGE_ROOT después de cargar contenido sin trasladar también sus binarios.

Cuando integremos el servidor y Nginx, sus límites de cuerpo y timeout deben acompañar esta configuración. Esta etapa todavía no abre un puerto ni instala Nginx.

## Contrato de controladores

Todas las funciones requieren ADMIN activo consultado en MySQL. La identidad procede exclusivamente de `req.user.id`, que establecerá el futuro middleware de sesión; nunca de campos libres enviados por el cliente. Las escrituras vuelven a comprobar esa cuenta dentro de su transacción.

| Función | Entrada | Resultado |
| --- | --- | --- |
| `OBRS_Archivos_CTS` | Query de listado | Metadatos seguros y `meta` |
| `OBRS_DetArchivo_CTS` | `params.id` | Metadatos seguros |
| `OBRS_ReferenciasArchivo_CTS` | `params.id` | Conteo de las cinco referencias y total |
| `CR_Archivo_CTS` | `params.tipo`, multipart con un archivo | Archivo DISPONIBLE, 201 |
| `UR_DuracionArchivo_CTS` | `params.id`, cuerpo `duracion_segundos` | Duración editada con auditoría |
| `ER_Archivo_CTS` | `params.id`, cuerpo vacío/ausente | Solicitud de borrado y estados de operaciones |
| `OBRS_ContenidoArchivo_CTS` | `params.id`, GET o HEAD, Range opcional | Bytes privados para administrador |

Todavía no hay endpoints productivos para ejecutar con curl. Las rutas y el servidor se conectan después. El servidor HTTP que aparece en las pruebas es exclusivo de prueba y no implementa autenticación productiva.

### Subida

`params.tipo`: VIDEO, IMAGEN o DOCUMENTO, en mayúsculas. Petición `multipart/form-data` con un único campo de archivo llamado `archivo`. No enviar campos de texto, más archivos, rutas, tamaños, hashes, nombres físicos o `subido_por`. No confiar en `req.file` de otro middleware: el controlador procesa el stream real. No debe precederse por un middleware que consuma el cuerpo multipart.

| Tipo | Extensiones |
| --- | --- |
| VIDEO | mp4, webm |
| IMAGEN | jpg, jpeg, png, webp |
| DOCUMENTO | pdf, docx, xlsx |

Verifica extensión, MIME (o application/octet-stream) y firma básica. Los DOCX/XLSX deben ser ZIP válidos con sus entradas propias; se recorren y descomprimen por streaming, con límites de complejidad, sin extraer contenido. Rechaza ZIP genérico renombrado, cifrado, entradas duplicadas/rutas inválidas y `vbaProject.bin`. Los nombres originales se conservan como etiqueta; el nombre físico es UUID aleatorio. Se calcula SHA256 durante la escritura, sin cargar el video completo en RAM. La validación no transforma codecs ni certifica que un video pueda reproducirse en todos los navegadores.

La duración se carga manualmente en segundos, solo para un VIDEO DISPONIBLE; se admite `null` para limpiarla y enteros de 1 a 4294967295. No se calcula automáticamente con ffmpeg en esta etapa.

Las respuestas de metadatos incluyen ID como texto, UUID, tipo, nombre original, MIME, tamaño como texto, duración, estado, autor y fechas UTC. Excluyen rutas, nombre físico, SHA256 y credenciales. La subida devuelve `data.id`, que se puede asociar a `video_archivo_id`, `portada_archivo_id` o `archivo_id` mediante los controladores de cursos de la etapa 2B.

### Listados y referencias

Filtros `tipo`, `estado`, `q`; paginación explícita `pagina`/`por_pagina`, máximo 500 por página. Por defecto devuelve todos los resultados. Orden permitido: `id`, `nombre_original`, `tipo`, `tamanio_bytes`, `creado_en`, `actualizado_en`; dirección ASC/DESC. No hay corte implícito de 100 archivos.

Referencias: portadas de cursos, videos de lecciones, portadas de lecciones, materiales y logos de comercios. Incluye referencias de contenido archivado/inactivo. El conteo informativo no reserva el archivo; el borrado vuelve a contar bajo bloqueo.

### Lectura

GET/HEAD solo para ADMIN por ahora. Devuelve 200 para todo el archivo, 206 para un rango simple válido, 416 para rango inválido con `Content-Range: bytes */tamaño`. Admite `bytes=inicio-fin`, `bytes=inicio-` y `bytes=-cantidad`. No acepta rangos múltiples.

Usa MIME canónico, `nosniff`, `private, no-store`, nombre original codificado y documentos como attachment. Verifica archivo regular, ausencia de symlink y tamaño físico igual al registrado. Cierra el descriptor también si el cliente cancela la descarga. En videos revisa cada cinco segundos que el administrador siga activo y el archivo disponible. El control de sesiones y permisos del alumno se integrará con Seguridad/Campus; no exponer esta función a alumnos ni hacer público el almacenamiento.

### Borrado y recuperación

`ER_Archivo_CTS` rechaza 409 si el archivo conserva cualquier referencia. Primero retirar/reemplazar esas asociaciones usando los controladores de contenido. Si queda libre, reutiliza la cola transaccional de la etapa 2B: marca PENDIENTE_ELIMINACION, borra físicamente y solo confirma ELIMINADO cuando terminó el `unlink`. Los metadatos permanecen como comprobante. Repetir la eliminación de uno ya ELIMINADO devuelve 200.

200 si terminó; 202 si la solicitud quedó confirmada pero el trabajo físico sigue pendiente o en ERROR. Respuesta con `data.id` y, cuando hay trabajos, `eliminaciones:[{id,estado}]`. Un archivo pendiente deja de poder asociarse o leerse.

Una subida validada primero registra SUBIENDO con auditoría; después crea el destino físico sin sobrescribir archivos y finalmente confirma DISPONIBLE con otra auditoría. Si falla antes de preparar la fila, elimina el temporal. Si falla después, descarta la fila SUBIENDO mediante la misma cola, conservando un comprobante. La limpieza interna no necesita que la cuenta siga activa, por lo que también funciona si se bloquea durante la carga. Si la base no responde o se interrumpe el proceso, queda recuperable. Ante una confirmación de commit incierta, conserva una fila ya DISPONIBLE; revisar el listado antes de volver a subir para evitar duplicados.

Recuperación manual:

```bash
cd ~/Node_Factore_V1
npm run archivos:recuperar
npm run archivos:reintentar
```

El primer script descarta cargas SUBIENDO creadas hace más de 24 horas y limpia `.tmp/UUID.part` regulares con más de 24 horas. Conserva las recientes y los archivos con nombres ajenos al protocolo; no sigue symlinks. El segundo reintenta la cola pendiente/error y recupera trabajos EN_PROCESO interrumpidos, según la etapa 2B. Ambos sí usan MySQL y el almacenamiento configurados. No borrar carpetas completas para recuperar espacio. La programación automática se incorporará al integrar el servidor.

Errores: 401 sin cuenta activa, 403 sin rol ADMIN, 404 archivo inexistente/no disponible, 409 archivo usado/carga en curso/tamaño físico inconsistente/concurrencia, 413 tamaño excedido, 415 cuerpo no multipart, 422 formato/datos/multipart inválidos, 408 timeout y 500 interno genérico.

## Instalación y verificación

Respaldar `src`, `Scripts`, `Tests`, `docs`, `package.json` y `package-lock.json` existentes. Extraer el ZIP en HOME. Luego:

```bash
cd ~/Node_Factore_V1
npm ci
npm run archivos:verificar
npm test
npm run modelos:verificar
npm run archivos:inicializar
```

La verificación de importaciones espera 1 controlador, 7 funciones y 18 modelos, sin conexión a MySQL. `archivos:inicializar` únicamente crea/verifica las cuatro carpetas privadas; no conecta a MySQL ni carga datos.

Pruebas: 15 casos nuevos de archivos con multipart HTTP real y almacenamiento temporal, más los 25 previos de CRM/contenido. Se ejecutaron en Node 18.16.0 con Sequelize/MySQL y adaptador SQLite aislado. No usan DESA ni sus binarios y no prueban bloqueos/concurrencia/precisión/collation de MySQL Server. La prueba funcional del conjunto contra MySQL se hará al conectar sesiones, rutas y servidor. Modelos sin cambios: 18, 185 campos, 68 asociaciones.

No ejecutar `npm run dev` todavía: aún falta integrar el arranque del servidor.
