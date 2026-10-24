# Factor E · Contrato de rutas HTTP

Todos los paths son completos. Montaje único desde `src/Routes/index.js`.

## Sesión y escritura

| Perfil | Cadena |
|---|---|
| Administración | autenticar → exigirPasswordActualizada → soloAdmin → parser JSON cuando corresponde → CTS |
| Campus | autenticar → exigirPasswordActualizada → soloAlumno → parser JSON para progreso → CTS |
| Auth pública | protegerOrigen → parser JSON → CTS con validación y límite de intentos |
| Perfil/cambio de contraseña | autenticar → parser JSON solo para PATCH → CTS; admite el cambio obligatorio pendiente |

Cookie `factore_sid`: HttpOnly, Path=/api, SameSite=Lax en DESA. Login y perfil retornan `data.csrf_token`. Escritos autenticados requieren `X-CSRF-Token`, y JSON con `Content-Type: application/json`, salvo multipart. Logout acepta la cookie ya revocada para ser idempotente y exige CSRF si todavía es válida.

Los IDs se devuelven como cadenas. Mandar BIGINT grandes como cadenas. Las fechas de permisos se envían como ISO UTC con Z, por ejemplo `2099-01-01T00:00:00.000Z`; `vence_en: null` significa sin vencimiento. Los listados usan los filtros ya documentados en las etapas; por defecto no recortan registros. La paginación es explícita con `pagina` y `por_pagina`. Ediciones parciales usan PATCH; no hay alias PUT.

Respuesta normal: `{"data": ...}` con meta/message cuando el controlador corresponde. Error: `{"error":{"code":"...","message":"..."}}`. No se devuelve stack, rutas de disco, contraseñas o hashes. Los enlaces de activación y recuperación se entregan solo al administrador que los genera y se comparten manualmente.

## Estado

GET `/api/status` → `{"ok":true,"message":"Backend Factor E funcionando correctamente."}`.

## Endpoints

### clientes

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/clientes` | `OBRS_Clientes_CTS` |
| GET | `/api/admin/clientes/:id` | `OBRS_DetCliente_CTS` |
| POST | `/api/admin/clientes` | `CR_Cliente_CTS` |
| PATCH | `/api/admin/clientes/:id` | `UR_Cliente_CTS` |
| DELETE | `/api/admin/clientes/:id` | `ER_Cliente_CTS` |

### clientesNotas

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/clientes/:cliente_id/notas` | `OBRS_ClientesNotas_CTS` |
| GET | `/api/admin/clientes/:cliente_id/notas/:id` | `OBRS_DetClienteNota_CTS` |
| POST | `/api/admin/clientes/:cliente_id/notas` | `CR_ClienteNota_CTS` |
| PATCH | `/api/admin/clientes/:cliente_id/notas/:id` | `UR_ClienteNota_CTS` |
| DELETE | `/api/admin/clientes/:cliente_id/notas/:id` | `ER_ClienteNota_CTS` |

### comerciosAmigos

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/comercios` | `OBRS_ComerciosAmigos_CTS` |
| GET | `/api/admin/comercios/:id` | `OBRS_DetComercioAmigo_CTS` |
| POST | `/api/admin/comercios` | `CR_ComercioAmigo_CTS` |
| PATCH | `/api/admin/comercios/:id` | `UR_ComercioAmigo_CTS` |
| DELETE | `/api/admin/comercios/:id` | `ER_ComercioAmigo_CTS` |

### comercioClientes

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/comercios/:comercio_id/clientes` | `OBRS_ClientesComercio_CTS` |
| GET | `/api/admin/clientes/:cliente_id/comercios` | `OBRS_ComerciosCliente_CTS` |
| POST | `/api/admin/comercios/:comercio_id/clientes` | `CR_ComercioCliente_CTS` |
| PATCH | `/api/admin/comercios/:comercio_id/clientes/:id` | `UR_ComercioCliente_CTS` |
| DELETE | `/api/admin/comercios/:comercio_id/clientes/:id` | `ER_ComercioCliente_CTS` |

### cursos

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/cursos` | `OBRS_Cursos_CTS` |
| GET | `/api/admin/cursos/:id` | `OBRS_DetCurso_CTS` |
| POST | `/api/admin/cursos` | `CR_Curso_CTS` |
| PATCH | `/api/admin/cursos/:id` | `UR_Curso_CTS` |
| DELETE | `/api/admin/cursos/:id` | `ER_Curso_CTS` |

### cursoModulos

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/cursos/:curso_id/modulos` | `OBRS_CursoModulos_CTS` |
| GET | `/api/admin/cursos/:curso_id/modulos/:id` | `OBRS_DetCursoModulo_CTS` |
| POST | `/api/admin/cursos/:curso_id/modulos` | `CR_CursoModulo_CTS` |
| PATCH | `/api/admin/cursos/:curso_id/modulos/:id` | `UR_CursoModulo_CTS` |
| DELETE | `/api/admin/cursos/:curso_id/modulos/:id` | `ER_CursoModulo_CTS` |

### cursoLecciones

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/cursos/:curso_id/lecciones` | `OBRS_CursoLecciones_CTS` |
| GET | `/api/admin/cursos/:curso_id/lecciones/:id` | `OBRS_DetCursoLeccion_CTS` |
| POST | `/api/admin/cursos/:curso_id/lecciones` | `CR_CursoLeccion_CTS` |
| PATCH | `/api/admin/cursos/:curso_id/lecciones/:id` | `UR_CursoLeccion_CTS` |
| DELETE | `/api/admin/cursos/:curso_id/lecciones/:id` | `ER_CursoLeccion_CTS` |
| DELETE | `/api/admin/cursos/:curso_id/lecciones/:id/video` | `ER_VideoLeccion_CTS` |

### cursoMateriales

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/cursos/:curso_id/materiales` | `OBRS_CursoMateriales_CTS` |
| GET | `/api/admin/cursos/:curso_id/materiales/:id` | `OBRS_DetCursoMaterial_CTS` |
| POST | `/api/admin/cursos/:curso_id/materiales` | `CR_CursoMaterial_CTS` |
| PATCH | `/api/admin/cursos/:curso_id/materiales/:id` | `UR_CursoMaterial_CTS` |
| DELETE | `/api/admin/cursos/:curso_id/materiales/:id` | `ER_CursoMaterial_CTS` |

### usuarios

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/usuarios` | `OBRS_Usuarios_CTS` |
| GET | `/api/admin/usuarios/:id` | `OBRS_DetUsuario_CTS` |
| POST | `/api/admin/usuarios` | `CR_Usuario_CTS` |
| PATCH | `/api/admin/usuarios/:id` | `UR_Usuario_CTS` |
| DELETE | `/api/admin/usuarios/:id` | `ER_Usuario_CTS` |
| POST | `/api/admin/usuarios/:id/activacion` | `CR_ActivacionUsuario_CTS` |
| POST | `/api/admin/usuarios/:id/recuperacion` | `CR_RecuperacionUsuario_CTS` |
| DELETE | `/api/admin/usuarios/:id/sesiones` | `ER_SesionesUsuario_CTS` |

### auth

| Método | Path | Handler |
|---|---|---|
| POST | `/api/auth/login` | `LOGIN_CTS` |
| GET | `/api/auth/me` | `OBRS_MiPerfil_CTS` |
| POST | `/api/auth/logout` | `LOGOUT_CTS` |
| PATCH | `/api/auth/password` | `UR_MiPassword_CTS` |
| POST | `/api/auth/activar` | `ACTIVAR_Cuenta_CTS` |
| POST | `/api/auth/recuperar` | `RECUPERAR_Cuenta_CTS` |

### archivos

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/archivos` | `OBRS_Archivos_CTS` |
| GET | `/api/admin/archivos/:id` | `OBRS_DetArchivo_CTS` |
| GET | `/api/admin/archivos/:id/referencias` | `OBRS_ReferenciasArchivo_CTS` |
| POST | `/api/admin/archivos/subir/:tipo` | `CR_Archivo_CTS` |
| PATCH | `/api/admin/archivos/:id/duracion` | `UR_DuracionArchivo_CTS` |
| DELETE | `/api/admin/archivos/:id` | `ER_Archivo_CTS` |
| HEAD | `/api/admin/archivos/:id/contenido` | `OBRS_ContenidoArchivo_CTS` |
| GET | `/api/admin/archivos/:id/contenido` | `OBRS_ContenidoArchivo_CTS` |

### accesos

| Método | Path | Handler |
|---|---|---|
| GET | `/api/admin/accesos` | `OBRS_CursoAccesos_CTS` |
| GET | `/api/admin/accesos/:id` | `OBRS_DetCursoAcceso_CTS` |
| POST | `/api/admin/accesos` | `CR_CursoAcceso_CTS` |
| PATCH | `/api/admin/accesos/:id` | `UR_CursoAcceso_CTS` |
| POST | `/api/admin/accesos/:id/renovar` | `RENOVAR_CursoAcceso_CTS` |
| POST | `/api/admin/accesos/:id/suspender` | `SUSPENDER_CursoAcceso_CTS` |
| POST | `/api/admin/accesos/:id/reactivar` | `REACTIVAR_CursoAcceso_CTS` |
| DELETE | `/api/admin/accesos/:id` | `ER_CursoAcceso_CTS` |
| GET | `/api/admin/accesos/:acceso_id/lecciones` | `OBRS_CursoAccesoLecciones_CTS` |
| PATCH | `/api/admin/accesos/:acceso_id/lecciones/:leccion_id` | `UR_CursoAccesoLeccion_CTS` |
| DELETE | `/api/admin/accesos/:acceso_id/lecciones/:leccion_id` | `ER_CursoAccesoLeccion_CTS` |
| GET | `/api/admin/accesos/:acceso_id/historial` | `OBRS_CursoAccesosHistorial_CTS` |

### campus

| Método | Path | Handler |
|---|---|---|
| GET | `/api/campus/cursos` | `OBRS_MisCursos_CTS` |
| GET | `/api/campus/cursos/:curso_id` | `OBRS_DetMiCurso_CTS` |
| GET | `/api/campus/cursos/:curso_id/lecciones/:leccion_id` | `OBRS_MiLeccion_CTS` |
| GET | `/api/campus/cursos/:curso_id/materiales` | `OBRS_MisMateriales_CTS` |
| GET | `/api/campus/cursos/:curso_id/progreso` | `OBRS_MiProgresoCurso_CTS` |
| PATCH | `/api/campus/cursos/:curso_id/lecciones/:leccion_id/progreso` | `UR_MiProgresoLeccion_CTS` |
| GET | `/api/campus/comercios` | `OBRS_ComerciosCampus_CTS` |
| GET | `/api/campus/comercios/:comercio_id` | `OBRS_DetComercioCampus_CTS` |
| HEAD | `/api/campus/cursos/:curso_id/lecciones/:leccion_id/video` | `OBRS_VideoCampus_CTS` |
| GET | `/api/campus/cursos/:curso_id/lecciones/:leccion_id/video` | `OBRS_VideoCampus_CTS` |
| HEAD | `/api/campus/cursos/:curso_id/portada` | `OBRS_PortadaCursoCampus_CTS` |
| GET | `/api/campus/cursos/:curso_id/portada` | `OBRS_PortadaCursoCampus_CTS` |
| HEAD | `/api/campus/cursos/:curso_id/lecciones/:leccion_id/portada` | `OBRS_PortadaLeccionCampus_CTS` |
| GET | `/api/campus/cursos/:curso_id/lecciones/:leccion_id/portada` | `OBRS_PortadaLeccionCampus_CTS` |
| HEAD | `/api/campus/cursos/:curso_id/materiales/:material_id/contenido` | `OBRS_MaterialCampus_CTS` |
| GET | `/api/campus/cursos/:curso_id/materiales/:material_id/contenido` | `OBRS_MaterialCampus_CTS` |
| HEAD | `/api/campus/comercios/:comercio_id/logo` | `OBRS_LogoComercioCampus_CTS` |
| GET | `/api/campus/comercios/:comercio_id/logo` | `OBRS_LogoComercioCampus_CTS` |

## Ejemplos para integrar

```js
// Login: recuperar csrf_token y conservar la cookie en el navegador.
const api = 'http://localhost:3001';
const respuesta = await fetch(`${api}/api/auth/login`, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const resultado = await respuesta.json();
if (!respuesta.ok) throw new Error(resultado.error.message);
let csrf = resultado.data.csrf_token;
```

```js
// Crear una ficha comercial, aunque todavía no tenga cuenta.
await fetch(`${api}/api/admin/clientes`, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ nombre: 'Cliente Factor E', email: 'cliente@example.com' })
});
```

```js
// Subir un video. NO fijar Content-Type: FormData crea el boundary.
const form = new FormData();
form.append('archivo', archivoElegido);
await fetch(`${api}/api/admin/archivos/subir/VIDEO`, {
  method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf }, body: form
});
// :tipo admite VIDEO, IMAGEN o DOCUMENTO, en mayúsculas.
// La respuesta incluye data.id, para asociar en curso/lección/material.
```

```jsonc
// POST /api/admin/accesos — curso completo, asignación manual.
{"usuario_id":"2","curso_id":"1","alcance":"COMPLETO","vence_en":"2099-01-01T00:00:00.000Z"}
```

```jsonc
// POST /api/admin/accesos — solo las lecciones elegidas.
{"usuario_id":"2","curso_id":"1","alcance":"SELECCION","vence_en":null,"lecciones":[{"leccion_id":"1","estado":"HABILITADA"}]}
```

```jsonc
// PATCH /api/admin/accesos/1/lecciones/1 — retirar un video.
{"estado":"BLOQUEADA","motivo":"Ajuste manual del acceso"}
```

DELETE `/api/admin/accesos/:acceso_id/lecciones/:leccion_id` requiere `{"confirmar":true}`: en COMPLETO vuelve a heredar el permiso del curso y en SELECCION quita esa elección. DELETE `/api/admin/accesos/:id` revoca la asignación; POST `/renovar` con `{"vence_en":null}` la renueva conservando progreso.

```js
// Alumno: guardar posición propia. No enviar usuario_id.
await fetch(`${api}/api/campus/cursos/${cursoId}/lecciones/${leccionId}/progreso`, {
  method: 'PATCH', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({ posicion_segundos: 45, completada: true })
});
```

Para `<video>` o imágenes entre orígenes autorizados usar `crossOrigin="use-credentials"` y la URL de la asociación del campus. El material usa `/api/campus/cursos/:curso_id/materiales/:material_id/contenido`; el administrador usa `/api/admin/archivos/:id/contenido`. No mandar token ni usuario en query, ni usar una carpeta pública de uploads.

Errores habituales: 401 sesión inválida; 403 CSRF/origen/rol/cambio obligatorio; 404 recurso no disponible en ese curso/usuario; 409 conflicto de estado/relación; 422 validación. Un recurso ajeno del campus devuelve 404. Las rutas GET de JSON admiten HEAD implícito; el contenido físico tiene HEAD explícito. OPTIONS lo responde CORS sin autenticar y sin consultar MySQL.

## Logo de comercio (05/10/2026)

PATCH /api/admin/comercios/:id/logo · ADMIN con cookie y CSRF. Cuerpo exclusivo: logo_archivo_id como cadena BIGINT o null para retirar. Exige imagen disponible en disco, audita la transacción y elimina el archivo anterior si no tiene referencias. Una eliminación pendiente responde 202 y devuelve eliminaciones. Detalle en COMERCIOS_LOGOS.md.

## Seguimiento administrativo

GET `/api/admin/seguimiento` devuelve `{ data, meta, resumen, consultado_en }`. GET `/api/admin/seguimiento/:id` devuelve `{ data, lecciones, meta, consultado_en }`. Exclusivo de ADMIN; consultas de lectura y sin cambios de permisos/progreso. El ID del detalle es el de la asignación. Filtros y criterios completos en `docs/SEGUIMIENTO.md`.


## Mi agenda · 21/10/2026

Benjamin Orellana · Rutas autenticadas de Agenda y permisos individuales.

Las rutas `/api/agenda` admiten cuentas ADMIN y ALUMNO con contraseña actualizada.
El rol no habilita Agenda: salvo consultar el estado propio, todas exigen un permiso
individual ACTIVO dentro de su ventana. La gestión `/api/admin/agenda` exige ADMIN.
Las escrituras agregan origen permitido, CSRF y parser JSON de hasta 1 MB.

| Método | Path | Handler |
| --- | --- | --- |
| GET | `/api/agenda/estado` | `OBRS_EstadoMiAgenda_CTS` |
| GET | `/api/agenda/mes` | `OBRS_MiAgendaMes_CTS` |
| GET | `/api/agenda/dias/:fecha` | `OBRS_MiAgendaDia_CTS` |
| PATCH | `/api/agenda/dias/:fecha` | `UR_MiAgendaDia_CTS` |
| PATCH | `/api/agenda/preferencias` | `UR_MisPreferenciasAgenda_CTS` |
| POST | `/api/agenda/dias/:fecha/tareas` | `CR_AgendaTarea_CTS` |
| PATCH | `/api/agenda/tareas/:id` | `UR_AgendaTarea_CTS` |
| DELETE | `/api/agenda/tareas/:id` | `ER_AgendaTarea_CTS` |
| POST | `/api/agenda/tareas/:id/recordar` | `RECORDAR_AgendaTarea_CTS` |
| POST | `/api/agenda/dias/:fecha/notas` | `CR_AgendaNota_CTS` |
| PATCH | `/api/agenda/notas/:id` | `UR_AgendaNota_CTS` |
| DELETE | `/api/agenda/notas/:id` | `ER_AgendaNota_CTS` |
| PATCH | `/api/agenda/dias/:fecha/notas/orden` | `ORDENAR_AgendaNotas_CTS` |
| POST | `/api/agenda/tiempos` | `INICIAR_AgendaTiempo_CTS` |
| POST | `/api/agenda/tiempos/:id/detener` | `DETENER_AgendaTiempo_CTS` |
| DELETE | `/api/agenda/tiempos/:id` | `ER_AgendaTiempo_CTS` |
| GET | `/api/admin/agenda/accesos/:usuario_id` | `OBRS_AgendaAccesoUsuario_CTS` |
| PATCH | `/api/admin/agenda/accesos/:usuario_id` | `UR_AgendaAccesoUsuario_CTS` |

Mes requiere `?mes=AAAA-MM`; día usa fecha `AAAA-MM-DD` de Argentina.
Las ediciones/eliminaciones requieren la versión leída. Primera escritura de un día,
preferencia o permiso todavía inexistente usa `version: 0`. Los cuerpos y respuestas
están detallados en `AGENDA_ETAPA2.md`. Las notas se ordenan con la lista completa
de `{id, version}`. No enviar usuario_id en las operaciones personales.

La instalación y la prueba autenticada de solo lectura están en `AGENDA_ETAPA3.md`.
No se configura precio ni se vinculan pagos en esta etapa.

## Configuración comercial de Mi agenda · 22/10/2026

`GET /api/admin/agenda/venta` y `PATCH /api/admin/agenda/venta` requieren sesión ADMIN con contraseña actualizada. El PATCH exige origen permitido, CSRF y versión vigente; permite precio en ARS, duración y preparación comercial. No modifica accesos individuales. Ver `AGENDA_ETAPA5_CONFIGURACION.md`.


## Compra autenticada de Mi agenda · 24/10/2026

Sesión de portal y contraseña actualizada en todas las rutas. Escrituras con CSRF y origen. La referencia se filtra por la cuenta autenticada.

- `GET /api/agenda/venta`
- `POST /api/agenda/compras`
- `GET /api/agenda/compras/:referencia`
- `POST /api/agenda/compras/:referencia/mercadopago`
- `POST /api/agenda/compras/:referencia/cancelar`
- `POST /api/agenda/compras/:referencia/aplicar`

Ver `AGENDA_ETAPA6_PAGOS.md` para instalación, reglas de entrega y validación SQL.
