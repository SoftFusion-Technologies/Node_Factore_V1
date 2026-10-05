# Factor E · Limpieza de sesiones y enlaces

Benjamin Orellana · 05/10/2026.

Este parche incorpora mantenimiento integrado en el backend existente. No modifica tablas, modelos, rutas, dependencias, package.json ni archivos de entorno.

## Regla de retención

Se eliminan físicamente únicamente filas que lleven al menos 30 días sin ser válidas:

- `usuarios_sesiones`: vencimiento o revocación ocurrido hace 30 días o más.
- `usuarios_tokens`: vencimiento, consumo o revocación ocurrido hace 30 días o más.

La primera de esas fechas que invalide la credencial inicia la retención. El límite de 30 días es inclusivo y usa el reloj UTC de MySQL. La fecha de creación y el estado de la cuenta no habilitan un borrado por sí solos. Una sesión antigua que todavía sea válida se conserva. Un enlace usado hoy se conserva durante 30 días, aunque su vencimiento original esté en el futuro.

No se eliminan usuarios, fichas comerciales, cursos, asignaciones, progreso ni eventos de auditoría.

## Ejecución automática

Al iniciar `server.js`, después de que la API esté escuchando, se inicia una limpieza. Se programa la siguiente 24 horas después de terminar. No necesita cron ni librerías adicionales. Mientras el backend esté apagado no corre; al arrancar vuelve a revisar los registros pendientes.

Cada ejecución borra en lotes de 500, hasta 20 lotes por tabla. Esta cota limita trabajo por ejecución; el resultado informa los pendientes. Si una carga excepcional supera 10.000 filas elegibles por tabla, se procesan en próximas ejecuciones; también puede repetirse el comando manual. Cada DELETE vuelve a comprobar el criterio de fechas.

Las ejecuciones automáticas no se superponen dentro de una misma instancia. Ejecutar manualmente o tener varias instancias es idempotente: ninguna borra una fila válida y las filas eliminadas no vuelven a contarse. Los logs incluyen fechas de corte, cantidades y códigos de error; no contienen identificadores personales, hashes ni enlaces.

Con SIGINT/SIGTERM se cancela el timer y no se empiezan nuevos lotes de borrado. El servidor deja de escuchar y espera la operación que esté en curso antes de cerrar MySQL. Un fallo del mantenimiento se registra sin interrumpir la API; se vuelve a intentar en el próximo arranque o ciclo diario.

## Consulta y aplicación manual

Desde `~/Node_Factore_V1`:

```bash
# Solo SELECT. No elimina nada.
node Scripts/limpiar-credenciales.js

# Aplicar la misma regla manualmente.
node Scripts/limpiar-credenciales.js --aplicar
```

El comando sin argumentos devuelve `modo: CONSULTA`, `retencion_dias: 30`, `candidatos`, `eliminados` en cero y `pendientes`. Con `--aplicar` devuelve `modo: APLICAR` y las cantidades realmente eliminadas. Si no hay registros antiguos, todas las cantidades son cero. No imprime hashes, contraseñas, tokens, emails o rutas SQL.

Tus registros creados y usados el 05/10/2026 se conservarán: aún no tienen 30 días desde su invalidación.

## Instalación y pruebas

Respaldar src, Scripts, Tests, docs y server.js. Descomprimir el ZIP sobre el proyecto. No requiere npm ci. Ejecutar `node --test Tests/limpieza-credenciales.test.js`, `npm test`, `npm run modelos:verificar` y la consulta manual. Luego reiniciar el backend con `nodemon server.js` o `npm run dev` para activar el job integrado.

Las pruebas nuevas verifican consulta sin escrituras, límites de un milisegundo, retención de vigentes/recientes, lotes y pendientes, revalidación ante modificación concurrente, idempotencia, interrupción, error y reintento, programación diaria, cierre ordenado y argumentos de CLI. El SQL Sequelize se ejecutó mediante SQLite aislado: no verifica bloqueos o collation del servidor MySQL ni modifica tu DESA. La validación real se realiza con la consulta anterior en tu equipo. No se realizó build ni deploy.

## Validación solo SELECT en Workbench

```sql
USE DB_FactoreDesa_04102026;
SET SESSION time_zone = '+00:00';

SELECT
  COUNT(*) AS total_sesiones,
  COALESCE(SUM(vence_en > UTC_TIMESTAMP(3) AND revocada_en IS NULL), 0) AS vigentes_por_fecha,
  COALESCE(SUM(
    vence_en <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)
    OR revocada_en <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)
  ), 0) AS candidatas_limpieza
FROM usuarios_sesiones;

SELECT
  COUNT(*) AS total_tokens,
  COALESCE(SUM(vence_en > UTC_TIMESTAMP(3) AND usado_en IS NULL AND revocado_en IS NULL), 0) AS pendientes_por_fecha,
  COALESCE(SUM(
    vence_en <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)
    OR usado_en <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)
    OR revocado_en <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)
  ), 0) AS candidatos_limpieza
FROM usuarios_tokens;
```

Estas consultas comprueban fechas y marcas de las credenciales. El permiso efectivo de ingreso también depende del estado del usuario y de la ficha del alumno, como ya valida autenticación.
