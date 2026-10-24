# Mi agenda · Etapa 1

Benjamin Orellana · 20/10/2026

Esta entrega agrega la estructura MySQL, seis modelos Sequelize y sus relaciones.
No incorpora pantallas, controladores, rutas ni pagos. No crea filas de acceso para
ningún usuario. Los cursos, compras, sesiones y progresos existentes se conservan.

## Estructura

| Tabla | Contenido |
| --- | --- |
| agenda_accesos | Permiso individual, estado, inicio, vencimiento y otorgante |
| agenda_preferencias | Tema claro u oscuro por usuario |
| agenda_dias | Fecha local, frase y exactamente tres pilares con su estado |
| agenda_tareas | Categoría, prioridad, hora, recordatorio y compleción |
| agenda_notas | Texto, estado y orden dentro del día |
| agenda_tiempo_registros | Tramos de tiempo por categoría, abiertos o cerrados |

Cada modelo se encuentra en `src/Models/Agenda/MD_TB_*.js`. Las asociaciones están
en `src/Models/Agenda/relacionesAgenda.js`; el registro central las inicializa una
sola vez. Se actualizan los verificadores existentes que contaban 21 modelos.
No cambian dependencias ni configuración del entorno.

## Reglas preparadas

- No tener fila de acceso significa no estar habilitado. Una fila creada sin
  estado explícito queda REVOCADO. El rol ADMIN tampoco crea permisos de Agenda.
  El control efectivo en endpoints se agregará en la próxima etapa; hoy no hay
  rutas de Agenda accesibles.
- Usuario y fecha identifican un único día. Las claves compuestas
  `(dia_id, usuario_id)` impiden asociar tareas, notas o tiempos al día de otra
  cuenta. Esto complementará el filtro por sesión en todos los servicios.
- Fecha del día y hora de tarea representan calendario argentino (UTC−3), sin
  convertirlas a instantes UTC. Inicio/fin del cronómetro y demás timestamps son
  instantes UTC con milisegundos.
- Se admite un cronómetro abierto por usuario y categoría, incluso entre días.
  Las cuatro categorías pueden estar corriendo al mismo tiempo, igual que el
  prototipo. Al cerrar un tramo se completa `fin_en`, `duracion_segundos` y se pone
  `en_curso = NULL` en una sola operación. El índice único permite muchos tramos
  cerrados y solo uno abierto por categoría. La próxima etapa calculará la duración
  desde el reloj del servidor; el cliente no fijará tiempos arbitrarios.
- `version` comienza en 1 y permite escribir condicionalmente sobre la versión
  leída. Los controladores incrementarán la versión y responderán conflicto cuando
  otra pestaña haya modificado el mismo registro. El modelo por sí solo no ejecuta
  este control ni incrementa el contador automáticamente.
- No se borra el contenido al suspender o revocar un permiso. No hay cascadas de
  borrado. Para eliminar un día deben tratarse primero sus registros relacionados.
- Notas no suman progreso. Los porcentajes y pesos (P1=5, P2=3, P3=1, pilar=4) se
  calcularán en el servicio, sin duplicar totales persistidos en esta etapa.

## Instalación en DESA

Detener el backend con Ctrl+C antes de aplicar el parche. El frontend puede seguir
abierto. Descargar el ZIP en Descargas y ejecutar:

```bash
(
  set -e
  umask 077

  FACTORE_ZIP="$(xdg-user-dir DOWNLOAD)/factore-agenda-etapa1-modelos-20261020.zip"
  test -f "$FACTORE_ZIP"
  cd "$HOME/Node_Factore_V1"

  FACTORE_RESPALDO="$HOME/backups/factore-agenda-etapa1-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$FACTORE_RESPALDO"
  for FACTORE_ITEM in src Scripts Tests docs; do
    if [ -e "$FACTORE_ITEM" ]; then
      cp -a "$FACTORE_ITEM" "$FACTORE_RESPALDO/"
    fi
  done

  mysqldump -h 127.0.0.1 -u root -p \
    --single-transaction --no-tablespaces \
    DB_FactoreDesa_04102026 > "$FACTORE_RESPALDO/base.sql"
  test -s "$FACTORE_RESPALDO/base.sql"

  unzip -o "$FACTORE_ZIP" -d "$HOME"

  mysql -h 127.0.0.1 -u root -p --default-character-set=utf8mb4 \
    DB_FactoreDesa_04102026 < docs/sql/AGENDA_ETAPA1.sql

  node Scripts/verificar-agenda-modelos.js
  npm run modelos:verificar
  npm run modelos:db
  node --test Tests/agenda-modelos.test.js
)
```

La contraseña solicitada por ambos comandos es la de MySQL. No escribirla en el
comando. `npm ci` no es necesario: no se modifican paquetes.

Después de obtener todas las verificaciones correctas, levantar el backend con
`nodemon server.js` como siempre. Su arranque exige las tablas registradas; si el
SQL falló, completar la instalación y verificar antes de volver a iniciarlo.

La migración usa `CREATE TABLE IF NOT EXISTS`, por lo que se puede volver a ejecutar
si se interrumpe. MySQL confirma cada CREATE TABLE de forma independiente: una
interrupción puede dejar parte de las tablas creadas. No ejecutar archivos de
`Tests/fixtures` en MySQL. Si una tabla ya existente difiere, `modelos:db` lo
detectará; no usar `sync`, `force` o `alter` para resolverlo.

## Resultados esperados

- Instalación nueva: seis tablas Agenda vacías; cero accesos habilitados.
- Registro global: 27 modelos, 295 campos, 96 asociaciones.
- MySQL: cuatro vistas, 41 claves foráneas, ocho compuestas, 53 CHECK efectivos y
  24 índices únicos (sin contar claves primarias).
- Once escenarios de Agenda comprobados sobre SQLite aislado, con SQL generado
  por Sequelize. Incluyen propiedad, coherencia de datos, rollback de movimiento,
  cronómetros y detección de versiones viejas. Las pruebas no usan MySQL DESA ni
  validan los bloqueos concurrentes específicos de InnoDB. `modelos:db` comprueba
  el esquema realmente instalado mediante SELECT.

## Próximas entregas

Primero servicios, controladores y rutas de Agenda con sesión, permiso vigente,
validación, propiedad y conflictos de edición. Después la interfaz con calendario,
tareas, pilares, notas, cronómetros, PDF diario y descarga de la guía. Al final,
precio administrable por Juan y compra para desbloquearla mediante Mercado Pago.
Los $15.000 mencionados siguen siendo orientativos; no se fija ningún precio aquí.
