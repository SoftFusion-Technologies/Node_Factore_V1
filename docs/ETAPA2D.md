# Factor E — Etapa 2D: usuarios y autenticación

Parche incremental sobre etapas 1, 2A, 2B y 2C instaladas. Compatible con Node 18.16.0, ES modules y las dependencias existentes. No modifica modelos, relaciones, SQL, `.env` ni binarios. No agrega dependencias; actualiza versión/scripts de package.json y el lock. No incluye README ni se ejecutó un build.

La entrega incorpora dos controladores: `src/Controllers/Usuario/CTS_TB_Usuarios.js` (8 funciones) y `CTS_Auth.js` (6), servicios en `src/Services/Usuario`, cinco middlewares y un helper de sesión en `src/Security/auth.js`, utilidades de contraseña/terminal y dos scripts. Ajusta el administrador común para exigir cambio de contraseña cuando corresponda, la auditoría transaccional para verificar la sesión HTTP y la revisión periódica del streaming administrativo de videos.

Todavía no hay rutas productivas ni servidor que iniciar. El servidor HTTP de `Tests/usuarios-auth.test.js` es exclusivo de prueba y usa SQLite aislado. Las rutas finales, CORS, parser JSON y arranque se conectarán después; no copiar el servidor de prueba para producción. La siguiente etapa es asignación manual de cursos/lecciones con fechas, antes de completar Campus e integración HTTP.

## Gestión de cuentas

Los controladores administrativos requieren un ADMIN activo y con `cambiar_password=0`. La identidad debe proceder exclusivamente del middleware de sesión. No aceptar IDs de usuario autenticado desde el cuerpo/query/cabeceras libres. Las escrituras vuelven a comprobar al actor y su sesión, cuando viene del middleware, dentro de la transacción.

| Función | Entrada | Comportamiento |
| --- | --- | --- |
| OBRS_Usuarios_CTS | Query | Todos los usuarios o paginación explícita |
| OBRS_DetUsuario_CTS | params.id | Cuenta y resumen de ficha comercial |
| CR_Usuario_CTS | Cuerpo de creación | Nueva cuenta pendiente o con contraseña temporal |
| UR_Usuario_CTS | params.id, cuerpo parcial | Editar nombre/email/estado/cambiar_password |
| ER_Usuario_CTS | params.id, cuerpo vacío | Baja lógica INACTIVO |
| CR_ActivacionUsuario_CTS | params.id, cuerpo vacío | Enlace manual para cuenta PENDIENTE |
| CR_RecuperacionUsuario_CTS | params.id, cuerpo vacío | Enlace manual para cuenta ACTIVO |
| ER_SesionesUsuario_CTS | params.id, cuerpo vacío | Revocar todas sus sesiones y enlaces pendientes |

Creación acepta `nombre`, `email`, `rol`, `cliente_id`, `estado`, `password`. Nombre y email son obligatorios; email se normaliza a minúsculas. Rol por defecto ALUMNO. Cada ALUMNO necesita una ficha comercial activa; un ADMIN debe tener cliente_id nulo. La clave única instalada impide más de una cuenta por cliente. No se crean fichas comerciales automáticamente: primero registrar el cliente mediante el CRM, luego su cuenta.

Sin password: estado PENDIENTE y password_hash nulo; se activa mediante enlace. Con password: estado ACTIVO y cambio obligatorio de contraseña (`cambiar_password=1`). Si se indica estado explícito, debe corresponder a ese flujo. Las contraseñas son de 15 a 128 caracteres, sin NUL y hasta 1024 bytes UTF-8. No recortar/alterar las contraseñas ni enviarlas en query/argumentos de consola. El admin puede entregar una contraseña temporal por su propio canal; el cliente debe cambiarla tras el primer login.

Edición acepta únicamente `nombre`, `email`, `estado`, `cambiar_password`. Rol y cliente_id permanecen fijos para preservar la titularidad del acceso/progreso/historial. Password no se edita por CRUD: usar recuperación o cambio propio. No activar una cuenta sin un hash válido ni una cuenta ALUMNO con ficha inactiva. Una cuenta que ya tiene contraseña no vuelve a PENDIENTE; usar recuperación. Una pendiente bloqueada/sin hash puede volver a PENDIENTE para emitir su activación.

Cambiar email, estado o el flag de cambio obligatorio revoca sesiones y enlaces pendientes cuando el valor cambia. Desactivar no elimina la ficha comercial, cursos, asignaciones, progreso ni auditoría. Reactivar una cuenta conserva su contraseña y requiere ficha activa; las sesiones revocadas no se recuperan. No se puede bloquear/desactivar el último ADMIN activo. Se usan bloqueos de fila; las colisiones/deadlocks de MySQL responden 409 para reintentar.

Listados: filtros `rol`, `estado`, `cliente_id`, `q`; paginación `pagina`/`por_pagina` solo si se pide, máximo 500 por página. Orden permitido `id`, `nombre`, `email`, `creado_en`, `actualizado_en`, dirección ASC/DESC. Todos por defecto, sin límite oculto de 100. Metadatos seguros, IDs como texto y fechas UTC; nunca devolver password_hash/token_hash o contenido privado de notas del cliente.

## Activación y recuperación manual

Juan genera el enlace desde el controlador administrativo y lo comparte manualmente. Esta etapa no envía correos ni mensajes ni necesita servicio SMTP.

La respuesta administrativa de emisión es 201 con `{data:{id,tipo,token,vence_en,enlace}}` y Cache-Control no-store. El token es aleatorio; en MySQL se guarda únicamente su SHA256. Se muestra su texto solo en esa respuesta para poder compartirlo. No guardarlo en auditoría/logs, analíticas o historial de navegación del backend.

ACTIVACION dura 48 horas y exige PENDIENTE. RECUPERACION dura 1 hora y exige ACTIVO. En ambos casos la ficha del ALUMNO debe seguir activa. Regenerar invalida todos los enlaces pendientes anteriores. Generar recuperación también revoca inmediatamente todas las sesiones existentes de esa cuenta, conservando acceso/progreso. Generar un enlace para uno mismo puede cerrar la sesión que lo solicitó; el enlace devuelto sigue siendo utilizable.

El cliente consume el enlace enviando token/password. Se vuelve a comprobar el estado, la ficha, el tipo, las fechas y la disponibilidad del token bajo bloqueo. Un enlace es de un solo uso y no es válido al llegar exactamente a vence_en (límite exclusivo UTC). Al consumirlo se establece la contraseña con hash, estado ACTIVO, flag de cambio en cero, token usado, y se revocan sesiones y demás enlaces pendientes. No inicia sesión automáticamente: realizar login después. Un password inválido no consume el enlace.

Activación y recuperación se mantienen como operaciones distintas; un token de un tipo no se acepta en el otro. Rechazos públicos usan mensaje genérico de enlace inválido/usado/vencido. Las páginas `/activar-cuenta` y `/recuperar-cuenta` del frontend todavía se implementarán.

## Autenticación y cuenta propia

| Función | Entrada | Resultado |
| --- | --- | --- |
| LOGIN_CTS | JSON email/password | Cookie de sesión, usuario, csrf_token y vence_en |
| OBRS_MiPerfil_CTS | Cookie, lectura GET | Usuario de esa sesión y CSRF; ignora IDs libres |
| LOGOUT_CTS | Cookie, CSRF, cuerpo vacío | Revoca esa sesión y borra la cookie |
| UR_MiPassword_CTS | Cookie, CSRF, JSON password_actual/password_nuevo | Verifica actual, cambia contraseña y revoca todas sus credenciales |
| ACTIVAR_Cuenta_CTS | JSON token/password | Activa cuenta PENDIENTE con enlace de un solo uso |
| RECUPERAR_Cuenta_CTS | JSON token/password | Actualiza contraseña de cuenta ACTIVO con enlace de un solo uso |

Login, cambio de password y consumo de enlaces exigen application/json; el futuro parser debe limitar el cuerpo, por ejemplo a 16 KiB. No aceptar campos desconocidos. Las respuestas usan Cache-Control no-store. Una contraseña manual/temporal permite leer perfil, cambiar contraseña o cerrar sesión; el resto de módulos permanece bloqueado hasta cambiarla.

La sesión usa cookie opaca `factore_sid`, HttpOnly, Path=/api, SameSite=Lax, host del API, sin Domain. No se devuelve el ID secreto de sesión en el JSON ni se acepta Bearer o cabeceras x-user-id. Guardar la cookie únicamente mediante el navegador; el frontend enviará requests con credentials incluidas. La base guarda SHA256 del token, nunca el token de sesión original.

Cada solicitud comprueba sesión no revocada/vigente, usuario ACTIVO y, para ALUMNO, ficha comercial activa. El rol procede de la base. Logout con cookie válida exige CSRF y revoca esa sesión; sin sesión vigente limpia la cookie y responde cerrado. Conservar/copiar una cookie revocada no la vuelve válida. Cambiar contraseña requiere la actual, una nueva distinta, sesión aún válida en la transacción y hash sin cambios; revoca todas las sesiones y enlaces pendientes. Luego volver a iniciar sesión.

Los videos administrativos revisan la sesión, estado de usuario y archivo cada cinco segundos cuando fueron abiertos mediante el middleware. Campus añadirá después el permiso vigente del alumno por curso/lección; los videos aún no se exponen a alumnos. Las llamadas directas de los controladores en los tests previos siguen usando un actor confiable de prueba. No exponer controladores protegidos sin middleware en rutas reales.

## Middlewares y protección de solicitudes

`src/Security/auth.js` exporta:

- `protegerOrigen`: validar Origin cuando existe contra la lista configurada.
- `autenticar`: resolver cookie real, consultar base, establecer req.user/session/sessionToken y comprobar CSRF en operaciones de escritura.
- `exigirPasswordActualizada`: bloquear módulos mientras el flag esté en 1.
- `soloAdmin` y `soloAlumno`: exigir el rol correspondiente, después de autenticar.
- `sesionVigente(req)`: helper booleano para la revisión de streaming.

En las próximas rutas administrativas: autenticar → exigirPasswordActualizada → soloAdmin → controlador. En Campus: autenticar → exigirPasswordActualizada → soloAlumno → controlador. Los endpoints de perfil/cambio de contraseña/logout deben seguir disponibles para una cuenta con cambio obligatorio. Login y consumo de enlaces validan origen/tipo de cuerpo sin exigir una sesión previa.

El JSON de login/perfil devuelve csrf_token; enviarlo en cabecera `X-CSRF-Token` al modificar datos, incluyendo futuras subidas multipart. El token está ligado a esa sesión y se compara de forma segura. SameSite no sustituye esta verificación. Requests con Origin ajeno se rechazan aun con cookie/CSRF válidos. Se admite ausencia de Origin para clientes de consola; siguen necesitando cookie y CSRF para escrituras protegidas.

Límite en memoria por proceso: 30 operaciones sensibles por IP en 15 minutos, y 10 logins por email normalizado en 15 minutos. Cuenta intentos correctos e incorrectos. Capacidad máxima de buckets 10000; scrypt tiene un máximo de dos derivaciones simultáneas. Respuesta 429 ante exceso. El limiter no se comparte entre procesos y se reinicia al reiniciar Node. No se confía directamente en X-Forwarded-For: cuando integremos Express/Nginx, configurar trust proxy solo para el proxy real antes de usar req.ip.

Contraseñas nuevas: scrypt N=65536, r=8, p=2, salt aleatorio de 16 bytes, key de 64 bytes y formato con parámetros. Se usa crypto nativo de Node; no hay dependencia bcrypt/jwt ni AUTH_SECRET que generar. La comparación usa timingSafeEqual. El verifier solo acepta ese formato; no importa hashes de otros sistemas automáticamente. Cuenta inexistente/hash inválido usa una derivación equivalente para el rechazo de credenciales. No se registran contraseñas, hashes o tokens en auditoría.

## Configuración opcional

El `.env` actual alcanza para verificar/crear el administrador. Valores predeterminados de DESA:

```dotenv
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
SESSION_HOURS=12
COOKIE_SECURE=false
COOKIE_SAMESITE=Lax
```

FRONTEND_URL forma los enlaces manuales; reemplazarlo por la dirección real del frontend al integrarlo. ALLOWED_ORIGINS contiene orígenes exactos, separados por coma, sin paths/comodines. SESSION_HOURS entre 1 y 168; las sesiones ya creadas conservan su vencimiento. SameSite acepta Lax, Strict o None; None requiere Secure. Con NODE_ENV=production Secure es true por defecto y no se acepta false. El despliegue final debe usar HTTPS y sus URLs/orígenes reales.

Cookie, servidor HTTP y política CORS se conectarán en la integración; esta etapa no abre puertos ni requiere iniciar `npm run dev`. No usar configuración productiva con HTTP local, porque la cookie Secure no se enviará por HTTP.

## Primer administrador por terminal

Después de instalar y verificar, ejecutar por separado:

```bash
cd ~/Node_Factore_V1
npm run admin:crear
```

El comando sí conecta a MySQL DESA usando el `.env` y crea una cuenta ADMIN y su auditoría. Antes de preguntar las credenciales comprueba que no exista ningún ADMIN. Pide nombre, email y contraseña dos veces; las entradas de contraseña permanecen ocultas, sin argumentos o variables de entorno. Password de 15 a 128 caracteres. La salida muestra ID/email y cambio obligatorio, sin hash ni contraseña.

No modifica tablas, no reinicia datos y no sobrescribe administradores existentes. Si ya hay ADMIN, usar gestión de cuentas/recuperación cuando esté integrado el API. Se probó el diálogo completo en una terminal PTY con base SQLite aislada; no se creó un administrador real en tu DESA durante esas pruebas. El primer login de esa cuenta requerirá cambiar su contraseña temporal.

## Instalación y comprobaciones

Respaldar src, Scripts, Tests, docs, package.json y package-lock.json. Extraer ZIP en HOME, luego:

```bash
cd ~/Node_Factore_V1
npm ci
npm run usuarios:verificar
npm test
npm run modelos:verificar
npm run modelos:db
```

Importaciones: 2 controladores, 14 funciones, 5 middlewares y 18 modelos; sin conexión a MySQL. Las 4 suites suman 58 subcasos: 18 de usuarios/auth y 40 previos. Las pruebas usan HTTP real, modelos Sequelize/MySQL y SQLite aislado, sin credenciales/bases/binarios DESA. Se avanzó un reloj controlado para aislar ventanas del rate limiter; vencimientos se comprueban contra UTC de la base de prueba. No verifican bloqueos/carreras/collation/precisión de MySQL Server. La validación funcional del conjunto contra MySQL se completará con las rutas/servidor.

`modelos:db` sí conecta a MySQL únicamente para verificar el esquema existente. Los modelos permanecen en 18, 185 campos y 68 asociaciones. No hubo cambios de dependencias ni de esquema.

Referencias de implementación: [Node 18 crypto](https://nodejs.org/docs/latest-v18.x/api/crypto.html), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
