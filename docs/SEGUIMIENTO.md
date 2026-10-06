# Factor E · Seguimiento administrativo · 06/10/2026

Autor: Benjamin Orellana. Etapa incremental: consultas de lectura, sin cambios de esquema, modelos, dependencias, configuración o credenciales.

## Rutas

- GET `/api/admin/seguimiento`: listado por asignación de alumno/curso y resumen del conjunto filtrado.
- GET `/api/admin/seguimiento/:id`: la misma asignación, más lecciones y progreso. `id` es el ID de acceso, no el ID de alumno.

Ambas rutas usan autenticar → exigirPasswordActualizada → soloAdmin. El controlador revalida el administrador desde la base. No hay escrituras ni eventos de auditoría por consultar; no aceptan una identidad enviada por el alumno. Cookie y respuestas privadas con las cabeceras existentes.

Listado: `q` (alumno/email/cliente/curso), `usuario_id`, `curso_id`, `estado_temporal`, `avance`, `vencimiento` (`7` o `30`), `pagina`, `por_pagina`, `ordenar_por`, `direccion`. Avance: SIN_INICIAR, EN_CURSO, COMPLETADO, SIN_CONTENIDO. Orden: id, alumno, curso, vence_en, ultimo_acceso_en o porcentaje; ASC/DESC. Detalle: q (lección/módulo), estado_progreso (SIN_INICIAR, EN_CURSO, COMPLETADA), habilitada (0/1), pagina, por_pagina; orden id, titulo o ultimo_acceso_en. Sin paginación explícita se devuelve el conjunto completo; máximo por página 500. Filtros desconocidos, arrays, IDs inválidos u órdenes libres se rechazan.

Consultas parametrizadas, nombres de orden de una lista fija, IDs BIGINT como cadenas exactas. COUNT y métricas del resumen como números. No se devuelven hashes, rutas de almacenamiento, notas CRM, sesiones ni observaciones del acceso.

## Criterio de avance

Las vistas instaladas `vw_accesos_estado` y `vw_campus_progreso_cursos` determinan el estado temporal y porcentaje sobre lecciones habilitadas ahora. El porcentaje es NULL si no hay contenido habilitado. SIN_INICIAR significa que ninguna lección habilitada tiene un registro de progreso; puede existir avance anterior en una lección que ya no está habilitada.

El historial agrega todos los registros persistentes de `leccion_progreso` de ese alumno/curso. No se borra al suspender, revocar, renovar, bloquear una lección o archivar contenido. `ultimo_acceso_en` es la última actividad del historial completo. El detalle incluye todas las lecciones actuales del curso, incluso borradores y contenido sin acceso.

Vencimientos: acceso ACTIVO por fecha/estado, límite mayor a la hora de DB y menor o igual a ahora + 7/30 días. Cuentas bloqueadas y cursos archivados siguen visibles para gestión, con sus estados y sin porcentaje habilitado. Un vencimiento temporal no implica que la cuenta o contenido permitan entrar. Consultado_en proviene del reloj UTC de MySQL; el navegador no define las ventanas. Cada lectura usa una transacción para una instantánea coherente de los datos. Las vistas temporales evalúan el reloj al ejecutar cada SELECT; un vencimiento justo durante la consulta puede cambiar el permiso entre consultas.

La habilitación es la de los metadatos/vistas de permisos. El campus sigue comprobando el archivo físico al reproducir o descargar; este panel no recorre el almacenamiento.

## Verificación

`node Scripts/verificar-seguimiento.js`

`npm run rutas:verificar`

`npm test`

`npm run modelos:verificar`

97 rutas totales, 92 protegidas, 15 módulos, 20 controladores, 90 funciones. El test nuevo usa HTTP real y SQLite aislado: rol/cookie, 111 lecciones y 112 asignaciones, filtros, 100% por selección, bloqueo, suspensión/revocación, cuenta/ficha/curso inactivos, programación y vencimiento, filtros inválidos, BIGINT e inexistentes. No abre MySQL DESA. El adaptador no sustituye una validación de bloqueos o rendimiento en MySQL Server.
