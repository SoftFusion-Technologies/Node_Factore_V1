# Factor E · Etapa 3: rutas y servidor

Parche incremental sobre las etapas 1 y 2A–2F ya instaladas. Conserva los modelos y controladores existentes y los conecta a una aplicación Express con paths completos, como en PREMIUM. Requiere Node 18.16.0 o superior, Python 3 para pruebas y MySQL 8.0.16+ para el servidor. Express 5.2.1 está fijado en package.json y package-lock.json.

## Organización

- `src/Routes/index.js`: reúne los 14 módulos con `router.use(...)`, sin agregar otro `/api`.
- `src/Routes/*.routes.js`: imports CTS, `router.get/post/patch/delete/head(...)`, middlewares explícitos y `export default router`.
- `app.js`: crea la aplicación y exporta `crearApp()` para pruebas. Importarlo no abre MySQL ni escucha un puerto.
- `server.js`: punto de entrada de `npm start` y `npm run dev`.
- `src/Middlewares/http.js`: CORS, cabeceras, parsers JSON por perfil, 404 y errores HTTP.
- `src/Services/Sistema/configServidor.service.js`: lee `.env` y valida configuración HTTP.
- `src/Services/Sistema/servidor.service.js`: comprueba conexión, UTC, presencia de tablas/vistas, storage y cierre ordenado.
- `Scripts/verificar-rutas.js`: comprueba paths, duplicados, handlers y cadenas de autenticación sin conectar a MySQL.
- `Scripts/probar-login.js`: login real por terminal con contraseña oculta; permite resolver el cambio obligatorio antes de tener frontend.
- `docs/API_RUTAS.md` y `docs/rutas.json`: contrato de endpoints.

## Instalar y verificar

Aplicar el ZIP desde `$HOME`, con respaldo previo de los archivos existentes. No copiar `.env.example` sobre tu `.env`. La contraseña y la cuenta que ya creaste continúan en la configuración y base existentes.

```bash
cd ~/Node_Factore_V1
npm ci
npm run rutas:verificar
npm test
npm run modelos:verificar
npm run modelos:db
```

Resultado del verificador: 14 módulos, 94 registros de ruta, 19 archivos de controladores y 87 handlers. Hay HEAD explícito en las seis rutas de contenido físico; las demás rutas GET también admiten HEAD por el comportamiento de Express.

## Iniciar

```bash
cd ~/Node_Factore_V1
npm run dev
```

Para iniciar sin observar cambios: `npm start`. El archivo que escucha es `server.js`; `app.js` exporta la aplicación para las pruebas. En Node 18 el modo `--watch` puede emitir su aviso experimental; el arranque normal no lo utiliza.

El valor por defecto es `HOST=127.0.0.1`, `PORT=3001`. Si tu `.env` tiene `PORT`, se respeta. El log indica el puerto efectivo.

En otra terminal:

```bash
curl -i http://127.0.0.1:3001/api/status
```

Respuesta: `{"ok":true,"message":"Backend Factor E funcionando correctamente."}`. Este endpoint confirma que HTTP está vivo; no consulta MySQL en cada petición. El arranque ya comprobó la conexión y presencia del esquema; la comparación completa de columnas y restricciones sigue en `npm run modelos:db`.

## Probar el administrador existente

Con el servidor encendido, en otra terminal:

```bash
cd ~/Node_Factore_V1
npm run auth:probar
```

Ingresar email y contraseña de la cuenta existente. La contraseña se escribe oculta. Si `cambiar_password=1`, pide una nueva y su repetición, realiza PATCH `/api/auth/password`, inicia sesión otra vez y verifica el perfil. La operación revoca las sesiones anteriores, como se definió en la etapa 2D. Al finalizar verifica logout y muestra solo el resultado, ID y rol; no guarda ni imprime cookies, CSRF o contraseñas.

La nueva contraseña requiere 15–128 caracteres y debe ser distinta. Si ya se cambió, el comando solo prueba login, perfil y logout. No recrear el administrador ni volver a instalar tablas.

## Configuración del frontend

Origen predeterminado: `http://localhost:5173`; también se admite `http://127.0.0.1:5173`. Si usás otro puerto, configurar `FRONTEND_URL` y `ALLOWED_ORIGINS` en `.env` y reiniciar. El backend y frontend deben usar un host coherente para la cookie; en desarrollo conviene usar `localhost` para ambos o `127.0.0.1` para ambos.

Para cada petición usar `credentials: 'include'` o `withCredentials: true`. El login/perfil devuelven `csrf_token`; las escrituras autenticadas lo envían como `X-CSRF-Token`. Los IDs del alumno provienen de la sesión. Los paths están bajo `/api`, que coincide con el Path de la cookie. No hay autenticación JWT ni roles/sedes de gimnasio en Factor E.

CORS permite solo orígenes exactos configurados, con credenciales; no usa `*`. Las cabeceras autorizadas son Content-Type, X-CSRF-Token y Range. Solicitudes sin Origin, como curl y la CLI, conservan la validación de cookie y CSRF cuando corresponde.

## Archivos y permisos

Las escrituras administrativas y del campus verifican sesión, contraseña actualizada, rol y CSRF antes de parsear el cuerpo. Las acciones JSON requieren Content-Type application/json; DELETE y acciones vacías usan `{}`. No existe parser global para multipart. `POST /api/admin/archivos/subir/:tipo` recibe directamente el stream privado.

JSON de gestión: hasta 1 MiB. JSON de auth/progreso: hasta 16 KiB. JSON inválido devuelve 400, exceso 413 y tipo/codificación no admitidos 415. Los permisos conservan las validaciones dentro de las transacciones de los controladores.

Los videos, imágenes y documentos se obtienen mediante rutas autenticadas, con GET/HEAD/rangos. El servidor no monta storage con `express.static`. El vencimiento y la revocación del campus se siguen revalidando durante el stream. Los bytes que el navegador ya recibió no pueden retirarse; estos controles cortan solicitudes y entrega de contenido posterior.

El timeout HTTP de recepción acompaña UPLOAD_TIMEOUT_MS (30 minutos por defecto), más 5 segundos de margen. El servicio multipart conserva sus límites por archivo y limpieza. Ctrl+C/SIGTERM deja hasta 10 segundos para finalizar conexiones, luego las corta y cierra MySQL. Los vencimientos de cursos no requieren un job.

TRUST_PROXY=false por defecto. Usar `loopback` solamente cuando un proxy local controlado sea el único punto de entrada. Para acceso remoto, HOST puede ser 0.0.0.0 o :: según la infraestructura. Producción usa HTTPS y COOKIE_SECURE=true, exigido por la configuración de autenticación.

## Validación realizada

Se probó con el ejecutable Node 18.16.0 y npm 9.5.1: instalación npm ci, verificación de rutas/modelos, regresiones anteriores y aplicación Express completa sobre SQLite aislado. Se comprobaron todas las rutas protegidas sin sesión, roles en gestión/campus, cambio obligatorio de contraseña, activación/recuperación, parámetros anidados, CORS/CSRF, cuerpo JSON, multipart, progreso, rangos y borrado físico. La CLI se probó en una terminal virtual para comprobar que no imprime secretos.

El adaptador SQLite conserva SQL generado por Sequelize pero no reproduce bloqueos, concurrencia ni collation de MySQL real. La prueba de arranque simula consultas de metadata. Ejecutar `npm run modelos:db` y arrancar contra tu DESA completa la verificación en tu instalación. No se modificaron tablas ni vistas.

El logo del comercio conserva la lectura del campus ya existente. El controlador administrativo instalado aún no permite asociar o retirar un logo; esa ampliación puede hacerse en un parche de controladores específico.
