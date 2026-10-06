# Factor E · Cierre integral de DESA

Esta etapa agrega un diagnóstico de solo lectura. No cambia modelos, rutas,
controladores, dependencias, configuración ni datos de clientes.

## Verificación instalada

Desde `~/Node_Factore_V1`:

```bash
npm run modelos:db
node Scripts/validar-desa.js --db --hash
```

`modelos:db` comprueba el esquema instalado. El nuevo comando verifica datos,
las cuatro carpetas privadas, todos los archivos DISPONIBLE y ELIMINADO,
el tamaño y el SHA256 de los disponibles. Lee videos por bloques; no los carga
enteros en memoria. Un video grande puede demorar la revisión.

Sin `--db` solo comprueba que el módulo puede importarse; no abre MySQL.
Con `--db` sin `--hash` revisa existencia, rutas seguras y tamaño, pero no detecta
una modificación que conserve exactamente el tamaño del archivo.

Resultado esperado:

- `ok: true`, todos los contadores de `errores` en `"0"`.
- `almacenamiento.incidencias_total: "0"`, cuatro carpetas revisadas.
- `modo: "SOLO_LECTURA"` y credenciales eliminadas: cero.
- Advertencias pendientes revisadas por separado; no son fallos de integridad.

El proceso devuelve código 1 cuando detecta un error o no puede completar la
consulta. Muestra hasta 20 incidencias de disco, conservando el total real.
Los IDs se mantienen exactos como cadenas. No imprime contraseñas, hashes,
tokens, nombres de archivo ni rutas privadas. Un SHA256 nulo en un archivo
DISPONIBLE se informa como incidencia si se solicita `--hash`.

Hacer la revisión sin subir, eliminar o modificar contenido al mismo tiempo.
La base y el disco se consultan sucesivamente: no forman una instantánea atómica.
Si un archivo cambia durante la revisión, terminar esa operación y repetir.
No se intentan reparar inconsistencias ni borrar archivos automáticamente.
Las consultas de vistas comprueban permisos y límites del progreso, pero esta
revisión no sustituye el recorrido funcional ni una revisión completa de seguridad.

## Recorrido manual completo

Mantener el backend con `nodemon server.js` y el frontend con `npm run dev`.
Abrir el alumno en otro navegador o una ventana privada para no reemplazar
la sesión del administrador.

1. Crear una ficha nueva llamada **Validación Factor E**, sin cuenta. Guardar
   una nota y comprobar que no aparece en el campus.
2. Crear su usuario ALUMNO desde esa ficha. Generar el enlace manual,
   abrirlo en la ventana privada, definir la contraseña e iniciar sesión.
3. Asignar **Motor de Resultados**, alcance COMPLETO, con vencimiento futuro.
   Confirmar que muestra las dos lecciones publicadas, permite reproducir
   video y acceder al material que tenga habilitado.
4. Completar una de las dos lecciones. Salir de la lección, volver y comprobar
   posición/estado guardados. Campus y Seguimiento deben indicar 1/2 y 50%.
   Volver a reproducirla no debe duplicar el evento de primera compleción.
5. Suspender el acceso como administrador. Actualizar el campus del alumno:
   no debe cargar ese curso ni permitir nuevas solicitudes de su video.
   Seguimiento conserva una lección completada en el historial y no muestra
   un porcentaje actual cuando no hay contenido habilitado. Los bytes ya
   descargados por el navegador no se pueden retirar.
6. Reactivar, luego revocar y comprobar nuevamente el bloqueo. Renovar el
   mismo acceso con una fecha futura: el curso vuelve y conserva el avance,
   la posición y el único evento de compleción.
7. Revisar Comercios amigos en el campus. Ocultar el comercio desde la
   administración, actualizar el campus y comprobar que desaparece; volver
   a habilitarlo. No deben mostrarse notas internas ni clientes vinculados.

Al terminar ejecutar otra vez `validar-desa.js --db --hash` y comparar los
SELECT de `docs/VALIDACION_CIERRE_DESA.sql` con Seguimiento. Para consultas
puntuales usar los IDs de la ficha, usuario, curso y acceso de esta prueba.
La cuenta de prueba puede desactivarse después; conservar historial y progreso.

## Mantenimiento ya implementado

- **Sesiones y tokens:** limpieza al arrancar el servidor y después cada
  24 horas. Conserva 30 días desde el primer vencimiento, uso o revocación.
  Una sesión válida no se borra por ser antigua. La vista previa es:
  `node Scripts/limpiar-credenciales.js` (no elimina filas).
- **Borrados de archivos:** `npm run archivos:reintentar` procesa trabajos
  pendientes/error; efectúa borrados reales cuando corresponde. No tiene
  programación automática actualmente.
- **Subidas interrumpidas:** `npm run archivos:recuperar` descarta subidas y
  temporales abandonados de al menos 24 horas. Es una operación real de
  mantenimiento; no forma parte del verificador de solo lectura.

Si hay advertencias de eliminaciones o subidas abandonadas, revisar el estado
antes de usar esos comandos y volver a verificar después. Un curso publicado
sin contenido apto puede existir después de archivar módulos o retirar videos;
es una advertencia editorial. No se publica en el campus sin lecciones aptas.

## Respaldo previo a producción

Respaldar juntos MySQL y el almacenamiento privado. Para una copia coherente,
detener el backend durante la copia, con Ctrl+C en su terminal, y no permitir
otros procesos que escriban en esa base o almacenamiento. Luego iniciar
nuevamente `nodemon server.js`. Este ejemplo no cambia la base:

```bash
(
  set -e
  cd "$HOME/Node_Factore_V1"
  FACTORE_COPIA="$HOME/backups/factore-datos-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$FACTORE_COPIA"
  chmod 700 "$FACTORE_COPIA"
  FACTORE_STORAGE="$(node --input-type=module -e 'import {storageRoot} from "./src/Services/Archivo/rutasArchivo.service.js"; console.log(storageRoot())')"
  test -d "$FACTORE_STORAGE"
  # Ajustar root, host y puerto si la conexión de .env usa otros valores.
  # -p pide la contraseña; no la escribe en el historial ni en argumentos.
  mysqldump --host=127.0.0.1 --port=3306 --user=root -p \
    --single-transaction --no-tablespaces --routines --triggers --events \
    DB_FactoreDesa_04102026 > "$FACTORE_COPIA/base.sql"
  test -s "$FACTORE_COPIA/base.sql"
  tar -czf "$FACTORE_COPIA/archivos.tar.gz" -C "$FACTORE_STORAGE" .
  chmod 600 "$FACTORE_COPIA/base.sql" "$FACTORE_COPIA/archivos.tar.gz"
  sha256sum "$FACTORE_COPIA/base.sql" "$FACTORE_COPIA/archivos.tar.gz" > "$FACTORE_COPIA/SHA256SUMS"
)
```

Guardar además una copia protegida fuera de esa máquina. Antes de producción
hay que probar su restauración en una base y carpeta separadas; una copia
existente no demuestra por sí sola que la restauración funciona. No restaurar
sobre DESA para probarla. Los archivos contienen datos privados.

## Alcance de las pruebas entregadas

Se ejecutan con Node 18.16, SQLite aislado y archivos físicos temporales.
La integración HTTP verifica al mismo alumno desde activación hasta avance,
suspensión, revocación, renovación y coincidencia con Seguimiento. Las pruebas
no se conectan al MySQL DESA ni reproducen sus bloqueos/collation.

El cierre queda confirmado cuando las verificaciones y el recorrido manual
pasan en la máquina de DESA. Después sigue la preparación del entorno de
producción y su publicación; esta entrega no construye ni despliega el sitio.
