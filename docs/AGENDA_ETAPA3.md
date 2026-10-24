# Mi agenda · Etapa 3: rutas y prueba autenticada

Benjamin Orellana · 21/10/2026

Esta entrega conecta las 18 operaciones de Agenda a la aplicación Express real.
No cambia tablas, modelos ni servicios de negocio de las etapas 1 y 2. No modifica
dependencias, configuración del entorno, cursos, compras o pagos. No habilita ninguna
cuenta y todavía no agrega el menú o la pantalla del frontend.

## Organización y contrato

`src/Routes/agenda.routes.js` define los paths completos y se monta una vez desde
`src/Routes/index.js`. El contrato completo está en `rutas.json`; la tabla de
endpoints está al final de `API_RUTAS.md`.

- Personal: `/api/agenda/estado`, `/mes`, `/dias/:fecha`, `/preferencias`, tareas,
  notas y registros de tiempo. Sesión y contraseña actualizada obligatorias.
- Administración: GET/PATCH `/api/admin/agenda/accesos/:usuario_id`, con rol ADMIN.
- ADMIN y ALUMNO pueden usar su Agenda personal si tienen permiso vigente. El rol
  no habilita el módulo ni permite consultar el contenido personal de otros usuarios.
- Consultar estado propio no requiere permiso de Agenda, pero sí sesión. Sin permiso
  devuelve `SIN_ACCESO` y `habilitada: false`, sin crear filas.
- Todas las demás operaciones personales exigen permiso individual ACTIVO dentro de
  su ventana. La sesión y el permiso se revalidan dentro del controlador/transacción.

Las escrituras pasan por autenticación y CSRF antes de leer JSON. El nuevo parser
`jsonAgenda` exige además origen permitido antes de leer el cuerpo, acepta objetos
JSON UTF-8 sin compresión y limita el tamaño a 1 MB. Ese límite permite enviar listas
completas de notas para reordenar, incluso superiores a 100. No se amplían los límites
de otras rutas. No se incorporan alias PUT, variantes de mayúsculas o barra final.

Los cuerpos, versiones y reglas funcionales se conservan según `AGENDA_ETAPA2.md`.
La compra para desbloquear Agenda y el precio administrable de Juan siguen para una
etapa posterior.

## Instalación

Requiere etapas 1 y 2 instaladas. Descargar
`factore-agenda-etapa3-rutas-20261021.zip` en Descargas y detener el backend con Ctrl+C.

```bash
(
  set -e
  FACTORE_ZIP="$(xdg-user-dir DOWNLOAD)/factore-agenda-etapa3-rutas-20261021.zip"
  test -f "$FACTORE_ZIP"
  cd "$HOME/Node_Factore_V1"

  FACTORE_RESPALDO="$HOME/backups/factore-agenda-etapa3-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$FACTORE_RESPALDO"
  for FACTORE_ITEM in src Scripts Tests docs; do
    if [ -e "$FACTORE_ITEM" ]; then
      cp -a "$FACTORE_ITEM" "$FACTORE_RESPALDO/"
    fi
  done

  unzip -o "$FACTORE_ZIP" -d "$HOME"
  npm run rutas:verificar
  npm run modelos:verificar
  node --test Tests/agenda*.test.js Tests/rutas-http.test.js
)
```

No ejecutar otro SQL ni `npm ci`. El resultado de rutas esperado es:

```json
{"modulos":20,"rutas":132,"controladores":30,"funciones":122}
```

Los modelos conservan 27 tablas, 295 campos y 96 asociaciones.

## Prueba sobre tu instalación DESA

En una terminal, levantar el backend como siempre:

```bash
cd ~/Node_Factore_V1
nodemon server.js
```

En otra terminal:

```bash
cd ~/Node_Factore_V1
node Scripts/probar-agenda-http.js
```

Ingresar email y contraseña de una cuenta existente y activa. La contraseña queda
oculta; no se imprime ni se guarda junto con cookies o CSRF. Si la cuenta requiere
cambiar contraseña, hacerlo primero con `npm run auth:probar`.

El script se conecta únicamente al backend local en el puerto de `.env`, inicia
una sesión propia, consulta el estado de Agenda y la cierra. No usa túnel HTTPS ni
necesita Mercado Pago o correo. Lee el origen del frontend configurado; ese origen
debe estar incluido en los permitidos por el backend.

Como nadie fue habilitado, el resultado esperado es:

```json
{"login":true,"agenda_habilitada":false,"estado_agenda":"SIN_ACCESO","logout":true}
```

Esto confirma que la ruta existe y respeta el bloqueo. No es un error. Si la cuenta
ya tiene permiso, consulta también el mes y el día actual y muestra solo cantidades
de tareas y notas. No imprime sus textos, no habilita permisos ni modifica Agenda.
Login/logout sí crean y revocan la sesión de esta prueba mediante la autenticación
habitual. Si una consulta falla, intenta cerrar igualmente esa sesión.

Una comprobación sin credenciales también sirve para confirmar la ruta:

```bash
curl -i http://127.0.0.1:3001/api/agenda/estado
```

Debe responder 401 (`SESION_INVALIDA`), porque no se envía una cookie válida.

## Validación realizada

- Verificador de rutas: contrato, handlers, permisos, parser y ausencia de rutas
  duplicadas. Las 18 funciones de controladores de Agenda tienen su ruta.
- Aplicación Express real con login/logout y SQL Sequelize sobre SQLite aislado:
  18 rutas sin cookie, CORS, CSRF/origen antes del JSON, formatos y tamaño, bloqueo
  por defecto, permisos individuales, operaciones propias, versiones, IDs ajenos,
  cronómetros, suspensión y conservación del contenido.
- Lista de 450 notas con cuerpo mayor a 16 KB, reordenada completa por HTTP.
- Prueba de consola en terminal interactiva simulada: cuenta bloqueada, habilitada
  y fallo del servidor; contraseña, cookies, CSRF y contenido privado no se imprimen.
- Regresión de las rutas existentes y de los modelos/servicios de Agenda anteriores.

Estas pruebas no se conectan a MySQL DESA, SMTP o Mercado Pago. SQLite no reproduce
los bloqueos entre conexiones de InnoDB. La prueba interactiva sobre DESA comprueba
tu servidor y sus consultas reales; la prueba funcional desde la nueva pantalla se
realizará en la próxima etapa.

## Próximo paso

Frontend: navegación Mi agenda, estado bloqueado y pantalla funcional con los
colores de Factor E. Se habilitará únicamente la cuenta de prueba elegida para
validarla; las demás permanecerán bloqueadas. La guía descargable y el PDF diario
forman parte de esa interfaz. El precio y el desbloqueo por pago se incorporan después.
