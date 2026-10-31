# Certificados - Etapa 2: emisión y descarga desde el campus

Benjamin Orellana - 30/10/2026.

Requiere la etapa 1 instalada. No agrega tablas, columnas ni migraciones. Mantiene 30 modelos, 331 campos y 108 asociaciones. Las rutas pasan de 140 a 144.

## Comportamiento

En el detalle del curso del alumno aparece “Certificado de finalización”. El servidor calcula su estado; no confía en el porcentaje, nombre, precio, horas ni fecha enviados por el navegador.

Para emitir por primera vez se exige:

- Cuenta ALUMNO activa, ficha activa y sesión válida, sin cambio obligatorio de contraseña.
- Curso publicado, certificado habilitado y carga horaria positiva configurada.
- Acceso COMPLETO y ACTIVO dentro de su ventana. Un acceso de SELECCION no certifica el curso completo.
- Al menos una lección PUBLICADA dentro de un módulo ACTIVO.
- Todas esas lecciones deben estar habilitadas para el alumno y tener progreso COMPLETADA con fecha de compleción.
- Las lecciones bloqueadas, programadas o no disponibles no se omiten para alcanzar un porcentaje artificial. Los borradores y módulos archivados no forman parte del contenido publicado que se exige.

El botón “Emitir certificado” guarda la primera emisión. Luego aparece “Descargar certificado PDF”. El diploma es A4 horizontal y presenta nombre, curso, carga horaria y fecha argentina. Reutiliza el logo, sello y firma del modelo entregado por Juan. No muestra QR ni código de verificación. Dice “por haber completado el curso”: no hay un examen ni una calificación de aprobación implementados.

Nombre, título, horas, cantidad de lecciones y fecha se congelan en curso_certificados. La plantilla v1 y las fuentes se incluyen en src/Assets/Certificado/v1 para regenerar el mismo documento. No editar estos archivos para cambiar diplomas ya emitidos; una futura plantilla debe tener otra versión.

El PDF se genera en memoria, sin archivos personales públicos. La autorización se obtiene de la cookie del alumno y de su curso, nunca de un ID de certificado o usuario libre. Los certificados emitidos mantienen su descarga propia autenticada aunque cambie la configuración o venza/revoque el acceso. La integración visual de esta etapa está en la ficha del curso; no se incorpora un listado histórico independiente de certificados.

## Integridad

La primera emisión serializa por cuenta, bloquea curso/acceso y verifica la sesión dentro de una transacción READ COMMITTED. La clave única usuario/curso es la última defensa contra duplicados. Repetir el POST devuelve el registro existente y no agrega otra auditoría. Si falla el PDF o la auditoría, se revierte la emisión. Una respuesta perdida se recupera con GET, sin fabricar otra identidad ni cambiar la fecha.

Descargas repetidas no escriben progreso, accesos, curso ni auditorías de emisión. Una cuenta bloqueada o una sesión revocada no puede descargar. La vista del alumno nunca permite editar la identidad ni la fecha del diploma.

## Instalación

1. Detener el backend. Respaldar src, Scripts, Tests, docs, package.json y package-lock.json de ambos proyectos.
2. Descomprimir el ZIP en $HOME.
3. Backend: npm ci; npm run modelos:db; npm run rutas:verificar; node --test Tests/certificados-emision.test.js Tests/certificados-configuracion.test.js Tests/rutas-http.test.js.
4. Frontend: node --test Tests/certificados-descarga.test.js Tests/certificados-entradas.test.js Tests/portal-session.test.js.
5. Reiniciar backend y frontend. No volver a ejecutar la migración de la etapa 1 para instalar esta entrega.

El único paquete directo nuevo es pdfkit 0.17.2. Las versiones existentes se mantienen. Fuentes DejaVu redistribuidas con licencia en el directorio de la plantilla. Los cambios no configuran pagos, correo ni credenciales.

## Prueba manual sugerida

1. En Gestión, confirmar Motor de Resultados con certificado habilitado y 12,50 horas de prueba (Juan debe definir la carga horaria final).
2. Ingresar como el alumno que tiene 2 de 3 lecciones: debe indicar la pendiente y no mostrar Emitir.
3. Completar la tercera lección desde el campus. Volver al curso y pulsar Actualizar certificado.
4. Pulsar Emitir certificado. Comprobar que cambie a Descargar certificado PDF.
5. Descargar y revisar nombre, título, 12,5 horas, fecha argentina, sello y firma. No hay QR ni código.
6. Recargar y volver a descargar: misma fecha y una sola emisión. Modificar horas o título después no cambia el diploma original.
7. Usar otra cuenta sin ese curso: no debe acceder al diploma por conocer el número de curso.

## SQL de verificación (solo lectura)

USE DB_FactoreDesa_04102026;

SELECT cc.id, u.email, cc.curso_id, cc.alumno_nombre, cc.curso_titulo,
       cc.carga_horaria, cc.lecciones_requeridas, cc.lecciones_completadas,
       cc.plantilla_version, cc.emitido_en AS emision_utc
FROM curso_certificados cc
JOIN usuarios u ON u.id = cc.usuario_id
ORDER BY cc.id DESC;

-- Una fila por alumno y curso; esperado 0 filas.
SELECT usuario_id, curso_id, COUNT(*) AS cantidad
FROM curso_certificados
GROUP BY usuario_id, curso_id
HAVING COUNT(*) > 1;

-- Una auditoría de primera emisión por certificado.
SELECT cc.id, cc.curso_id, COUNT(a.id) AS emisiones_auditadas
FROM curso_certificados cc
LEFT JOIN auditoria_eventos a
  ON a.entidad = 'curso_certificados' AND a.entidad_id = cc.id
 AND a.usuario_id = cc.usuario_id AND a.accion = 'CERTIFICADO_EMITIDO'
GROUP BY cc.id, cc.curso_id
ORDER BY cc.id;

## Validación de desarrollo

Pruebas completas del backend bajo Node 18.16 y frontend, rutas reales con SQLite aislado, ESLint de los archivos React modificados, recorridos de navegador a 1440/390/320 px y renderizado de PDF de una página con nombres/títulos extensos y cambio de día argentino. SQLite no reproduce bloqueos de MySQL: la prueba de instalación en la base DESA corresponde a npm run modelos:db y al recorrido manual.

La auditoría de dependencias del proyecto señala avisos previos en body-parser/qs/nodemailer; esta entrega no cambia sus versiones ni ejecuta actualizaciones mayores automáticas. Revisarlos en una tarea de mantenimiento separada antes de preparar producción.
