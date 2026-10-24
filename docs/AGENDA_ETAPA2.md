# Mi agenda · Etapa 2: servicios y controladores

Benjamin Orellana · 20/10/2026

Se agregan cinco servicios y cinco controladores dentro de sus carpetas `Agenda`.
La etapa usa las seis tablas ya instaladas. No modifica modelos, relaciones,
dependencias, configuración, autenticación existente ni rutas de la aplicación.
No habilita usuarios ni realiza cobros.

## Alcance

- Estado del acceso propio, calendario mensual y detalle de un día.
- Frase y tres pilares, guardados parcialmente con control de versión.
- Tareas con categoría, prioridad, hora, recordatorio, compleción y cambio de fecha.
- Notas con texto, estado, eliminación y reordenamiento completo.
- Cronómetro independiente por categoría: iniciar, pausar y eliminar tramos cerrados.
- Preferencia de tema claro/oscuro.
- Gestión administrativa explícita de un permiso individual, con motivo, inicio y
  vencimiento. Se prepara para habilitar cuentas de prueba al conectar las rutas.

Todavía no existe una URL nueva para probar con curl: las rutas se incorporan en
la siguiente entrega. El servidor HTTP del test es exclusivo de pruebas y no se
exporta a la aplicación real. La pantalla, guía descargable, PDF diario y pago para
desbloquear Agenda se incorporarán después.

## Organización

| Archivo en Services/Agenda | Responsabilidad |
| --- | --- |
| agendaAcceso.service.js | Sesión, permisos, transacciones, auditoría y gestión de acceso |
| agendaDatos.service.js | Fechas, categorías, versiones, métricas y duración |
| agendaDia.service.js | Calendario, detalle, frase, pilares y preferencias |
| agendaContenido.service.js | Tareas, recordatorios, notas y orden |
| agendaTiempo.service.js | Inicio, pausa y eliminación de registros de tiempo |

Los controladores son `CTS_Agenda.js`, `CTS_TB_AgendaAccesos.js`,
`CTS_TB_AgendaTareas.js`, `CTS_TB_AgendaNotas.js` y
`CTS_TB_AgendaTiempoRegistros.js` en `src/Controllers/Agenda/`.

## Acceso y seguridad

La identidad se obtiene de la cookie de sesión validada por el backend. Cabeceras,
cuerpos o filtros con un usuario libre no autentican ni seleccionan una agenda.
Cada consulta personal lleva el usuario de sesión y cada escritura se ejecuta en
una transacción con su cuenta bloqueada. Se revalida sesión y vigencia del permiso
antes de confirmar. Una cuenta inactiva, bloqueada o con cambio obligatorio de
contraseña no puede usar Agenda.

Sin permiso, programado, vencido, suspendido o revocado: solo se permite consultar
el estado propio del acceso. No se devuelve el contenido personal. Ser ADMIN no
desbloquea Agenda; el administrador sí puede gestionar permisos individuales sin
usar una agenda personal. No existe operación de habilitación masiva.

Las escrituras requieren método exacto, JSON, origen permitido y CSRF de sesión.
Los parámetros tienen listas de campos permitidos. Los IDs BIGINT se conservan
como cadenas. Las respuestas son privadas y no se almacenan en caché.

Auditoría y modificación confirman juntas. Solo se registran IDs, nombres de campos,
versiones y estados: no se copian textos de tareas, notas, frases, contraseñas o
tokens a los eventos. El motivo del permiso permanece en su registro administrativo.

## Contratos que usarán las rutas

- Estado propio: GET sin parámetros libres. Devuelve `habilitada`,
  `estado_temporal`, inicio, vencimiento y versión; nunca crea el permiso.
- Mes: GET con `mes=AAAA-MM`. Devuelve todos los días, métricas y hasta dos tareas
  de vista previa por día, más su cantidad adicional.
- Día: GET con `params.fecha=AAAA-MM-DD`. Devuelve día, tareas, notas, tiempos,
  cronómetros abiertos y preferencias. Leer un día vacío devuelve versión 0 sin
  insertarlo. Los elementos del día se devuelven completos, sin corte implícito en 100.
- Guardar día: PATCH con `version` y los campos modificados: `frase`,
  `prioridad_1_texto`, `prioridad_1_cumplida` y equivalentes para prioridades 2 y 3.
- Preferencia: PATCH con `version` y `tema` (`CLARO` u `OSCURO`).
- Crear tarea: POST con `params.fecha`, `texto`, `categoria` y opcionales `hora`,
  `prioridad` (número 1, 2 o 3), `recordatorio`, `completada`. No admite IDs ni timestamps.
- Editar tarea: PATCH con `params.id`, `version` y campos modificados. `fecha`
  opcional mueve la tarea a otro día propio, conservando su compleción. La hora
  admite HH:MM; `null` o vacío la quita si no queda un recordatorio habilitado.
- Eliminar tarea/nota/tramo: DELETE con `params.id` y cuerpo `{ "version": N }`.
- Recordar tarea: POST con `params.id` y versión. Solo una tarea pendiente de hoy,
  con recordatorio y hora alcanzada, puede marcarse. `recordatorio_marcado=true`
  identifica la primera marca; repetir devuelve false. La futura interfaz mostrará
  la notificación solo en el primer caso. Cambiar día, horario o habilitación del
  recordatorio limpia la marca anterior.
- Crear nota: POST con `params.fecha` y `texto`; el servidor coloca su orden.
- Editar nota: PATCH con `params.id`, `version` y `texto`/`cumplida`.
- Ordenar notas: PATCH con `params.fecha` y `{ "notas": [{ "id": "...",
  "version": N }, ...] }` en el orden completo deseado. IDs, cantidad y versiones
  deben coincidir con las notas actuales de ese día.
- Iniciar tiempo: POST con `categoria`. El servidor usa la fecha actual argentina
  y su reloj; no admite fecha, inicio o duración del dispositivo. Si esa categoría
  ya está corriendo, devuelve el mismo tramo, con `creado=false`.
- Detener tiempo: POST con `params.id` y versión. Un tramo ya detenido se devuelve
  sin sumar otra vez ni cambiar su fin. Un tramo abierto no se elimina sin pausarlo.
- Gestión de permiso: GET/PATCH de un `params.usuario_id` explícito, solo ADMIN.
  PATCH requiere `version`, `estado` y `motivo`; `inicio_en` y `vence_en` son
  opcionales, se conservan si se omiten y usan ISO UTC con Z. Para un permiso nuevo
  la versión esperada es 0. Activar exige cuenta activa y ficha activa si es alumno.

`AGENDA_VERSION_CAMBIADA` (409) indica edición vieja: actualizar los datos antes de
reaplicar la intención del usuario. No reemplazar una versión vieja por la nueva
automáticamente ni repetir una creación a ciegas tras perder la respuesta.
Cada tarea y nota tiene su versión. La versión del día protege sus campos propios;
no es una versión de todo el conjunto de tareas/notas. El reordenamiento comprueba
la lista y versión de todas las notas para no ocultar ediciones o altas recientes.

## Tiempo, progreso y conservación

Los días y horarios son de Argentina, UTC−3. Los instantes son UTC. Las categorías
son OPERATIVO, COMERCIAL, ESTRATEGICO y PERSONAL. Puede haber cuatro cronómetros
simultáneos, uno por categoría. Un tramo pertenece al día en que se inició; si cruza
medianoche continúa en ese día hasta pausarlo. Iniciar otro tramo después de la
pausa lo ubica en la fecha actual. Cambiar de día en pantalla no cambia su registro.

Al modificar un permiso se cierran los tramos abiertos con la hora del servidor,
limitada por el vencimiento anterior. Un acceso vencido puede conservar filas
abiertas hasta la siguiente modificación administrativa, pero no permite leer o
escribir contenido y su tiempo nunca se calcula más allá del vencimiento.
Suspender, revocar y reactivar no borra tareas, notas, pilares o tramos cerrados.

Progreso: tarea P1=5, P2=3, P3=1; pilar no vacío=4. Se calcula el porcentaje
redondeado y se devuelven también puntos y cantidades. Las notas no suman puntos.
El estado COMPLETADO exige terminar todos los elementos, aunque un porcentaje
redondeado pudiera mostrar 100 con muchas tareas y una pendiente.

## Verificación e instalación

Prerrequisito: etapa 1 instalada y `modelos:db` correcto. Descargar
`factore-agenda-etapa2-controladores-20261020.zip` en Descargas. Detener el backend
con Ctrl+C y ejecutar:

```bash
(
  set -e
  FACTORE_ZIP="$(xdg-user-dir DOWNLOAD)/factore-agenda-etapa2-controladores-20261020.zip"
  test -f "$FACTORE_ZIP"
  cd "$HOME/Node_Factore_V1"
  FACTORE_RESPALDO="$HOME/backups/factore-agenda-etapa2-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$FACTORE_RESPALDO"
  for FACTORE_ITEM in src Scripts Tests docs; do
    if [ -e "$FACTORE_ITEM" ]; then
      cp -a "$FACTORE_ITEM" "$FACTORE_RESPALDO/"
    fi
  done
  unzip -o "$FACTORE_ZIP" -d "$HOME"
  node Scripts/verificar-agenda-controladores.js
  node --test Tests/agenda*.test.js
  npm run modelos:verificar
  npm run rutas:verificar
)
```

Esperado: cinco controladores, 18 funciones, cinco servicios y 27 modelos. Las rutas
existentes mantienen su verificación: no se agregaron endpoints todavía. No hace
falta `npm ci`, otro SQL, credenciales de pago o SMTP. Levantar luego con
`nodemon server.js` como siempre.

Las pruebas usan cookies y HTTP reales sobre controladores con SQLite en memoria,
sin acceder a MySQL DESA ni servicios externos. Cubren 16 escenarios de integración
y tres pruebas de cálculo/fechas, además de las pruebas de modelos de la etapa 1.
SQLite no reproduce bloqueos entre conexiones, collation o límites físicos de
InnoDB. La integración con rutas y las pruebas manuales sobre DESA siguen pendientes
para la próxima etapa.
