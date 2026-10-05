# Factor E — Etapa 2F: backend del campus del alumno

Programador: Benjamin Orellana. Fecha: 05/10/2026.

Parche incremental sobre las etapas 1 y 2A–2E. Incluye cinco controladores del campus (13 funciones),
cuatro servicios, verificador y pruebas. Node 18.16.0 compatible. Sin dependencias nuevas,
sin cambios de MySQL, modelos, relaciones ni `.env`. Versión del paquete: 0.5.0.

## Contenido y privacidad

La identidad siempre proviene de la cookie validada con la autenticación de etapa 2D. Los controladores
vuelven a comprobar sesión, cuenta activa, ficha CRM activa, rol ALUMNO y contraseña actualizada.
Ni `req.user` proporcionado por un cliente, ni cabeceras con un ID, ni filtros `usuario_id` permiten
acceder a otra cuenta. No se incorpora una vista de alumno para ADMIN en estos controladores.

El campus consulta `vw_campus_lecciones_habilitadas`: asignación activa dentro de fechas,
curso publicado, módulo activo, lección publicada, video disponible, selección/excepción vigente.
Los cursos se listan solo si existe al menos una lección habilitada en ese momento.
Un curso asignado con catálogo oculto sigue estando disponible si cumple esas condiciones.
Revocados, suspendidos, vencidos, futuros, archivados o selecciones sin videos habilitados no se muestran.
El progreso histórico permanece en MySQL y reaparece al recuperar el permiso.

El detalle agrupa únicamente módulos con lecciones habilitadas. No revela títulos de contenido
bloqueado, borradores, rutas físicas, hashes, observaciones de asignaciones/CRM, autores administrativos,
clientes de comercios ni historial administrativo. Un ID existente pero no autorizado devuelve 404.

Materiales generales: requieren al menos una lección habilitada del curso. Materiales por lección:
requieren permiso sobre esa lección. En ambos casos, asociación activa y archivo DOCUMENTO DISPONIBLE.
Las reglas se aplican tanto a la lista como a la descarga directa por ID de material.

Comercios: solo `activo=1` y `mostrar_a_usuarios=1`. Un alumno activo sin cursos puede consultarlos.
La presentación contiene exclusivamente campos públicos; sus contactos comerciales y notas quedan privados.
Cambiar visibilidad o actividad también impide pedir nuevamente su logo.

## Contratos para las futuras rutas

Todavía no incluye servidor, rutas de aplicación ni interfaz frontend. Son controladores listos para
conectar en la etapa de rutas. La cadena prevista es `autenticar → exigirPasswordActualizada → soloAlumno`;
los controladores revalidan por sí mismos antes de consultar o transmitir. Mantener los middleware
para homogeneizar el control y los errores. JSON autenticado usa `Cache-Control: private, no-store`.

| Archivo en src/Controllers/Campus | Función | Parámetros y resultado |
|---|---|---|
| CTS_CampusCursos.js | OBRS_MisCursos_CTS | Sin IDs de usuario. Cursos habilitados, límites del acceso y resumen de progreso |
| CTS_CampusCursos.js | OBRS_DetMiCurso_CTS | params.curso_id; curso con módulos y lecciones habilitadas |
| CTS_CampusCursos.js | OBRS_MiLeccion_CTS | params.curso_id, params.leccion_id; descripción, duración y posición propia |
| CTS_CampusMateriales.js | OBRS_MisMateriales_CTS | params.curso_id; materiales generales y de lecciones habilitadas |
| CTS_CampusProgreso.js | OBRS_MiProgresoCurso_CTS | params.curso_id; totales actuales, porcentaje, lecciones y propuesta para retomar |
| CTS_CampusProgreso.js | UR_MiProgresoLeccion_CTS | params.curso_id, params.leccion_id; PATCH de posición/finalización propias |
| CTS_CampusComercios.js | OBRS_ComerciosCampus_CTS | Comercios públicos para el campus autenticado |
| CTS_CampusComercios.js | OBRS_DetComercioCampus_CTS | params.comercio_id; ficha pública visible |
| CTS_CampusArchivos.js | OBRS_VideoCampus_CTS | params.curso_id, params.leccion_id; GET/HEAD de video autorizado |
| CTS_CampusArchivos.js | OBRS_PortadaCursoCampus_CTS | params.curso_id; portada del curso habilitado |
| CTS_CampusArchivos.js | OBRS_PortadaLeccionCampus_CTS | params.curso_id, params.leccion_id; portada de lección habilitada |
| CTS_CampusArchivos.js | OBRS_MaterialCampus_CTS | params.curso_id, params.material_id; descarga autorizada |
| CTS_CampusArchivos.js | OBRS_LogoComercioCampus_CTS | params.comercio_id; logo del comercio visible |

IDs positivos exactos; BIGINT como texto. Ningún endpoint del campus recibe un `archivo_id` libre.
Los IDs de portada/video que aparecen en metadatos identifican asociaciones, no autorizan lectura directa.
Los URLs se construirán al definir las rutas; las pruebas usan rutas temporales exclusivas del servidor de test.
El perfil personal ya está cubierto por `OBRS_MiPerfil_CTS` de etapa 2D.

## Listados

Sin paginación, devuelve todos los registros filtrados. `pagina`/`por_pagina` habilitan paginación explícita
(hasta 500 por página); no se admite `limit` libre ni corte a 100. `direccion` ASC/DESC y `ordenar_por`
se validan con listas permitidas. Respuestas `{data, meta}`; consultas de detalle `{data}`.

- Cursos: `q` busca título o descripción corta; orden por id, titulo, orden.
- Materiales: `q` por título, filtro `generales=true` o `leccion_id` (excluyentes), orden id, titulo, orden.
  El filtro de lección debe pertenecer al curso y estar habilitado.
- Comercios: `q` por nombre/descripcion, igualdad de rubro/ciudad, orden id, nombre, orden.
- Progreso y transmisión de archivos no admiten query adicional.

## Guardado y significado del progreso

Ejemplo de cuerpo para UR_MiProgresoLeccion_CTS:

```json
{"posicion_segundos": 75, "completada": true}
```

Usar PATCH con Content-Type application/json. Se puede enviar cualquiera de esos dos campos, al menos uno. Posición entera no negativa;
no puede superar la duración registrada cuando el administrador la definió. Duración desconocida
admite entero unsigned de hasta 4294967295. La posición puede retroceder al volver a ver una parte.

La primera escritura crea EN_CURSO o COMPLETADA. `completada=true` marca finalización y registra
una única auditoría LECCION_COMPLETADA dentro de la misma transacción. `false` o una posición nueva
no desmarcan una lección completada ni cambian su fecha de finalización.
El cliente no puede enviar estado libre, fechas de finalización, IDs de usuario ni autor.

El servidor verifica permiso y archivo físico antes de guardar; comprueba nuevamente sesión y permiso
antes de confirmar. READ COMMITTED y bloqueos sobre cliente, usuario, curso, acceso, sesión, archivo y
fila de progreso evitan confirmar una modificación concurrente no autorizada. Una caducidad detectada
al final o un error de auditoría revierte el cambio. El adaptador SQLite no prueba esos bloqueos reales.

El porcentaje es completadas / lecciones actualmente habilitadas, igual que el criterio de la vista
MySQL de progreso. Agregar contenido, ocultarlo o modificar permisos puede cambiar el porcentaje,
sin borrar finalizaciones anteriores. Completar es una acción del alumno; posición guardada no acredita
tiempo visto ni constituye protección contra descargar o grabar contenido al que tuvo acceso.
`retomar` elige la última lección habilitada con progreso; no propone una ahora bloqueada o vencida.

## Transmisión privada

Videos, imágenes y documentos usan el servicio de archivos privados de etapa 2C:
GET/HEAD, rango simple o sufijo, 206 cuando corresponde, 416 para rangos inválidos,
MIME canónico, Content-Length, nosniff y no-store. DOCUMENTO se entrega como attachment.
No se publica una carpeta con express.static ni se generan enlaces públicos al disco.

Autorización antes de abrir, nueva comprobación antes de enviar cabeceras y revisión durante el envío
para TODOS los tipos de archivo. Campus revisa cada segundo la sesión, cuenta, curso/selección,
visibilidad del comercio o asociación de material/portada. Cambiar el archivo asociado detiene el archivo
anterior, aunque continúe existiendo en disco. La lectura se cierra y libera su descriptor al terminar,
fallar, perder permiso o desconectarse el cliente.

Los vencimientos conocidos de sesión, curso o video/material programan además una revisión al llegar
a esa fecha. Si Juan renovó el permiso, la revisión conserva la transmisión y reprograma su límite.
Si revocó o se venció, las siguientes solicitudes se deniegan y la transmisión en curso se interrumpe.
Las comprobaciones dependen del tiempo de respuesta de la base; bytes ya entregados o almacenados
en el navegador no pueden retirarse. No se ofrece DRM ni borrado del contenido ya recibido.

El servicio compartido mantiene la interfaz previa de `vigente` booleano y admite respuesta con
`permitido`/`restante_ms`. La administración conserva su intervalo de cinco segundos y ahora también
revalida antes de servir y durante documentos/imágenes; el campus usa un segundo.

## Corrección de conservación UTC

La integración detectó una conversión local de strings DATETIME al volver a guardarlos con Sequelize.
Se normalizan a Date UTC dos casos: fecha de finalización ya registrada y fechas omitidas en una edición
individual de excepción de video. Se incluye actualización de CTS_TB_CursoAccesoLecciones.js de etapa 2E,
sin cambiar su contrato, para conservar exactamente hora y milisegundos.
No se altera SQL ni se corrigen datos existentes automáticamente. La prueba de accesos verifica ahora
fechas con hora/minutos/milisegundos al alternar un bloqueo; la de campus verifica fecha de finalización
idéntica al guardar otra posición. Se ejecuta la regresión también con zona Argentina.

## Verificación

```bash
npm ci
npm run campus:verificar
npm test
npm run modelos:verificar
npm run modelos:db
```

`campus:verificar` importa cinco controladores, comprueba 13 funciones y los 18 modelos, sin conectar MySQL.
Los tests usan HTTP y cookies reales con almacenamiento temporal y SQLite aislado. Su fixture contiene
las cuatro vistas del esquema MySQL, con el mismo SQL de selección y un reloj UTC de pruebas.
Prueban aislamiento, permisos, rangos, material, comercios, progreso, rollback, conservación UTC,
111 registros sin recorte y corte de transmisiones largas de video/documento. Observan el cierre del
servidor para distinguirlo de bytes que un cliente pausado aún conserva en su socket.
No escriben en DESA. No validan concurrencia, colación ni bloqueos de MySQL Server.
`modelos:db` sí verifica la estructura real de MySQL mediante lecturas.

`docs/VALIDACION2F.sql` contiene solamente SELECT para revisar permisos y progreso reales cuando
existan cursos/alumnos cargados. Los fixtures SQLite dentro de Tests no se instalan en MySQL.

Próxima etapa: rutas de aplicación y arranque del servidor; después integración del frontend.
