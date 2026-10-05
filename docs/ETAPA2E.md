# Factor E — Etapa 2E: asignaciones manuales y fechas de acceso

Programador: Benjamin Orellana. Fecha: 05/10/2026.

Parche incremental sobre las etapas 1 y 2A–2D. Incluye tres controladores (12 funciones), dos servicios,
verificador local y pruebas. Mantiene las 18 tablas, los modelos, las relaciones y las cuatro vistas actuales.
No cambia `.env`, dependencias ni esquema. Node 18.16.0 compatible.

## Comportamiento

- Un alumno y un curso tienen una única fila de asignación. Si ya existe, crear devuelve 409;
  editar, renovar o reactivar trabaja sobre la misma fila. No borra ni reinicia `leccion_progreso`.
- Se puede asignar a un ALUMNO ACTIVO o PENDIENTE con cliente activo. Un cliente sin cuenta sigue
  funcionando en CRM; necesita cuenta de alumno antes de recibir un curso. ADMIN no recibe asignaciones.
- Para otorgar, renovar o reactivar: curso PUBLICADO y al menos un video publicado disponible en disco
  dentro de una ventana vigente o futura. PENDIENTE puede tener asignación, pero no ve contenido hasta activar su cuenta.
- COMPLETO hereda las lecciones publicadas actuales y futuras. Una excepción BLOQUEADA deniega;
  una HABILITADA respeta sus fechas propias. Una excepción vencida deniega aunque el curso sea completo.
- SELECCION permite únicamente las lecciones HABILITADA expresamente configuradas.
  Quitar o bloquear la última, o reemplazar por una selección vacía, suspende la asignación activa.
  Agregar otra lección conserva la suspensión: la reactivación es una acción explícita.
- Un nuevo alcance SELECCION activo necesita al menos una lección habilitada. No se transforma
  automáticamente en COMPLETO por quedar vacío.
- SUSPENDIDO y REVOCADO cortan el permiso. La revocación es lógica y conserva progreso, archivos e historial.
  Para un revocado se usa reactivar o renovar; suspender no sustituye la revocación.
- Archivo o publicación retirados cortan el permiso sin borrar la configuración. Cuando el contenido
  vuelve a estar disponible, se aplican nuevamente las fechas y reglas conservadas.

## Fechas y renovación

Las entradas requieren texto ISO UTC con `Z`, por ejemplo `2026-12-31T23:59:59.999Z`.
El frontend convertirá la fecha local de Argentina a UTC. Se rechazan fechas sin zona, con offset,
fechas normalizadas inválidas como 30 de febrero y precisión superior a tres decimales.

Inicio inclusivo y vencimiento exclusivo: `[inicio, vence)`. `vence_en: null` significa sin vencimiento.
Una fecha de video nula hereda el límite del curso. El permiso usa la intersección de ambas ventanas;
una ventana HABILITADA completamente fuera del curso se rechaza dentro de la misma transacción.
Las fechas de BLOQUEADA no habilitan acceso, pero conservan una ventana propia válida.

ACTIVO es el estado guardado. ACTIVO, PROGRAMADO y VENCIDO se calculan al consultar con
`UTC_TIMESTAMP(3)` de la base. No hay un cron que actualice filas para hacer vencer permisos.
SUSPENDIDO y REVOCADO prevalecen sobre las fechas.

Renovar requiere `vence_en` explícito, admite `inicio_en` opcional y establece estado ACTIVO.
Por defecto conserva el inicio y las fechas de cada excepción. Si estas quedan fuera de la nueva
ventana, o todas las seleccionadas ya vencieron, la renovación se rechaza; no se descartan restricciones.
`restablecer_fechas_lecciones: true` pone inicio/vencimiento particulares en null, mantiene
la selección y todos los bloqueos. Si no hay selección habilitable, primero configurar una lección.

Editar fechas con el controlador de edición conserva el estado ACTIVO/SUSPENDIDO/REVOCADO actual;
no reactiva implícitamente. Editar únicamente observaciones funciona también con curso archivado
o alumno bloqueado, igual que suspender/revocar.

## Contratos de controladores

Todavía no se incorporan rutas ni servidor. Estos son los contratos para conectarlos en su etapa.
Todas las llamadas de este módulo requieren la cadena de middleware de etapa 2D:
`autenticar → exigirPasswordActualizada → soloAdmin`. La autenticación verifica cookie, origen y CSRF;
no aceptar `req.user` ni IDs de sesión desde cuerpo, query o cabeceras libres.

Archivo `src/Controllers/Acceso/CTS_TB_CursoAccesos.js`:

| Función | Parámetros | Cuerpo / efecto |
|---|---|---|
| OBRS_CursoAccesos_CTS | query | Lista administrativa con alumno, curso y estado temporal |
| OBRS_DetCursoAcceso_CTS | `params.id` | Asignación, ficha resumida, asignador y excepciones |
| CR_CursoAcceso_CTS | — | `usuario_id`, `curso_id`; opcionales alcance, inicio_en, vence_en, lecciones, observaciones_internas, motivo. Actor de sesión; 201 |
| UR_CursoAcceso_CTS | `params.id` | Edición parcial: alcance, inicio_en, vence_en, lecciones, observaciones_internas, motivo |
| RENOVAR_CursoAcceso_CTS | `params.id` | vence_en obligatorio; inicio_en, restablecer_fechas_lecciones y motivo opcionales |
| SUSPENDER_CursoAcceso_CTS | `params.id` | `{}` o motivo; estado SUSPENDIDO |
| REACTIVAR_CursoAcceso_CTS | `params.id` | `{}` o motivo; ACTIVO con fechas conservadas, rechaza vencido |
| ER_CursoAcceso_CTS | `params.id` | `{}` o motivo; estado REVOCADO, conserva la fila |

`usuario_id`, `curso_id` y `asignado_por` son inmutables en edición. `estado` no se admite en cuerpos
genéricos: usar las acciones específicas. `lecciones`, cuando está presente, es reemplazo completo de
excepciones; cuando se omite, conserva todas. Se conservan los IDs de excepciones que siguen configuradas.
Una entrada es `{leccion_id, estado?, inicio_en?, vence_en?}`. Estado por defecto HABILITADA; fechas
omitidas en el reemplazo completo se guardan null. IDs positivos exactos; enviar BIGINT como texto.
Lista máxima 10000, sin duplicados. Para habilitar se valida curso propio, publicación, módulo activo y video físico.
Bloquear lecciones propias también funciona con contenido archivado.

Archivo `src/Controllers/Acceso/CTS_TB_CursoAccesoLecciones.js`:

| Función | Parámetros | Cuerpo / efecto |
|---|---|---|
| OBRS_CursoAccesoLecciones_CTS | `params.acceso_id` | Lista todas las lecciones del curso con configuración, permiso calculado y sus límites efectivos |
| UR_CursoAccesoLeccion_CTS | `params.acceso_id`, `params.leccion_id` | estado, inicio_en, vence_en; motivo opcional. Actualiza o crea una excepción |
| ER_CursoAccesoLeccion_CTS | mismos | `confirmar: true`; motivo opcional. Retira excepción; COMPLETO vuelve a heredar, SELECCION deja de permitir |

La edición individual es parcial: omitir una fecha la conserva; enviar null la limpia.
Una excepción nueva empieza HABILITADA y con fechas nulas. Es obligatorio al menos un campo
de configuración. Para quitar acceso a un video de un curso COMPLETO usar `{estado: "BLOQUEADA"}`;
retirar su excepción con DELETE puede volver a habilitarlo y exige `confirmar: true` por ese efecto.

Archivo `src/Controllers/Acceso/CTS_TB_CursoAccesosHistorial.js`:

`OBRS_CursoAccesosHistorial_CTS` recibe `params.acceso_id`; muestra eventos con autor resumido,
motivo y configuración antes/después. Filtro accion y búsqueda por motivo.

## Listados y respuestas

Sin paginación, devuelven todos los registros filtrados. Paginación explícita: `pagina`, `por_pagina`
(1–500), `ordenar_por`, `direccion`. No se acepta `limit` libre ni corte implícito a 100.
Todas las respuestas usan `data`; listados agregan `meta`. Errores: `{error: {code, message}}`.

Asignaciones: filtros usuario_id, curso_id, estado, alcance, estado_temporal, vence_desde y vence_hasta;
`q` busca nombre/email del alumno o título del curso. Rango de vencimientos `[desde, hasta)` excluye
asignaciones sin vencimiento. Para próximos siete días filtrar estado_temporal ACTIVO y enviar el rango UTC.
Orden por id, inicio_en, vence_en, creado_en, actualizado_en.

Lecciones: filtros modulo_id y estado de publicación, `q` por título; orden id, titulo, orden.
El campo `evaluado_en` identifica el instante UTC usado en el diagnóstico. `habilitada` usa permisos y
metadatos; no significa que el archivo haya sido abierto ni acredita reproducción. No expone rutas ni hashes.
Este diagnóstico es exclusivo del administrador; no sustituye la autorización del endpoint de video del campus.

Historial: orden id o creado_en, ASC por defecto; `direccion=DESC` muestra el último primero.

## Transacciones y seguridad

Mutaciones bajo READ COMMITTED, fila del curso y de asignación bloqueadas. Se conserva el orden de
bloqueo cliente → alumno → curso → acceso → excepciones y archivos ordenados por BIGINT.
El administrador y su sesión se vuelven a comprobar dentro de `conAuditoria` antes de escribir.
Los cambios de permisos, historial específico y auditoría general se confirman juntos o se revierten juntos.
La unicidad MySQL sigue protegiendo doble asignación y excepciones duplicadas.

Historial almacena alcance, fechas, estados y selección antes/después; excluye observaciones internas,
hashes y rutas. Los motivos son texto administrativo y no llegan al campus. Auditoría general registra
IDs, nombres de campos y si hubo suspensión automática o restablecimiento de fechas.
`asignado_por` conserva al autor inicial; cada modificación tiene su autor en historial.
Según los ENUM existentes: edición de fechas se registra RENOVADO; edición de selección LECCION_MODIFICADA;
edición de alcance u observaciones `ALCANCE_MODIFICADO`.

## Ejemplos de cuerpos

Asignación por selección:

```json
{
  "usuario_id": "2",
  "curso_id": "1",
  "alcance": "SELECCION",
  "inicio_en": "2026-10-05T12:00:00.000Z",
  "vence_en": "2026-12-01T03:00:00.000Z",
  "lecciones": [
    {"leccion_id": "1"},
    {"leccion_id": "2", "vence_en": "2026-11-01T03:00:00.000Z"}
  ]
}
```

Renovación preservando bloqueos y selección, pero limpiando vencimientos particulares:

```json
{
  "vence_en": "2027-01-01T03:00:00.000Z",
  "restablecer_fechas_lecciones": true,
  "motivo": "Nueva habilitación manual"
}
```

## Verificación e instalación

```bash
npm ci
npm run accesos:verificar
npm test
npm run modelos:verificar
npm run modelos:db
```

`accesos:verificar` solo importa los controladores y comprueba 12 funciones y 18 modelos, sin MySQL.
Las pruebas de accesos usan un servidor HTTP temporal con los middleware reales, SQL generado por
Sequelize/MySQL ejecutado en SQLite aislado y archivos privados temporales. No conectan a DESA ni
crean asignaciones reales. Comprueban la lógica y SQL generado; no prueban bloqueos/concurrencia,
colación ni comportamiento del servidor MySQL real. `modelos:db` verifica estructura MySQL mediante lecturas.
`docs/VALIDACION2E.sql` permite revisar asignaciones reales cuando existan, usando solamente SELECT.

El puente de pruebas ahora interpreta también datos_antes/datos_despues como JSON, igual que el
driver MySQL. Ningún archivo de producción de etapas anteriores se reemplaza salvo los manifiestos
para agregar el comando accesos:verificar y marcar versión 0.4.0.

Siguiente etapa: campus del alumno, progreso, reproducción/descarga privada con comprobación de permiso
en cada solicitud, y corte de transmisión al revocar o vencer. Luego rutas y servidor de aplicación.
