# Certificados · Etapa 1 · Configuración y registro

Benjamin Orellana · 24/10/2026

## Alcance

Gestión → Cursos → Nuevo curso o Editar curso incorpora Certificado de finalización. El administrador define la carga horaria y puede habilitar el diploma. La ficha del curso muestra esa configuración.

Esta entrega prepara los datos para la emisión: no genera PDFs, no emite certificados existentes y no agrega todavía un botón al alumno. La próxima entrega incorporará validación del curso completo, primera emisión y descarga del diploma A4 horizontal con el diseño enviado por Juan. Se quitarán QR y código de verificación, y se usará «completado el curso» al no existir evaluaciones.

## Datos y reglas

- `cursos.certificado_carga_horaria`: decimal exacto, entre 0.01 y 9999.99 horas, nullable cuando está deshabilitado. El formulario admite coma o punto, sin separadores de miles.
- `cursos.certificado_habilitado`: 0 o 1; habilitar requiere carga horaria positiva. Los cursos existentes comienzan deshabilitados y sin horas definidas.
- La carga horaria es definida por Juan; no se calcula a partir del precio, la duración del acceso o la duración de los videos.
- Editar estos campos usa las rutas administrativas de cursos existentes, con sesión ADMIN, origen, CSRF y auditoría. No agrega endpoints públicos de escritura.
- Las ediciones parciales conservan campos no modificados. Limpiar las horas de un certificado habilitado exige deshabilitarlo en el mismo cambio.
- Se puede preparar esta configuración mientras el curso está en borrador. Eso no emite un diploma ni acredita que alguien lo completó.
- Precio, acceso, progreso, compras y Agenda conservan sus valores.

`curso_certificados` queda preparada con una fila única por alumno y curso. Guardará nombre del alumno, título, carga horaria, cantidad de lecciones requeridas y completadas, versión de plantilla y fecha de primera emisión. Sus referencias conservan la integridad del alumno y el curso; borrar físicamente un registro relacionado queda restringido.

Los datos del certificado son una copia de la primera emisión, no una vista del perfil y curso actuales. Corregir el nombre del alumno, el título o las horas después no cambiará esa copia. En la futura descarga se usarán estos datos guardados.

El ID de la tabla es interno: no se agrega al diseño como código de verificación ni existe una consulta pública de certificados.

La integridad de la tabla impide duplicados y registros con cero lecciones o cantidades declaradas incompletas. La próxima etapa deberá contrastar el progreso real con las lecciones requeridas del curso completo: el porcentaje de una selección de lecciones no basta para emitir un diploma completo.

## Instalación DESA

1. Detener el backend antes de extraer los archivos, porque los modelos requieren los cambios de esquema.
2. Respaldar ambos proyectos y `DB_FactoreDesa_04102026`.
3. Extraer el ZIP en el directorio personal.
4. Ejecutar `docs/sql/CERTIFICADOS_ETAPA1.sql` desde el backend. Agrega dos columnas y tres CHECK a cursos, y crea la tabla de certificados con cinco CHECK. Puede repetirse sin reiniciar valores ni emitir certificados.
5. Ejecutar `npm run modelos:db`, `npm run rutas:verificar` y `node --test Tests/certificados-configuracion.test.js`.
6. Desde el frontend, ejecutar `node --test Tests/certificados-entradas.test.js`.
7. Reiniciar backend y frontend.

No hay dependencias nuevas ni cambios en `.env`. El verificador reconoce 30 modelos, 331 campos, 108 asociaciones, 47 claves foráneas, 8 compuestas, 73 CHECK, 26 índices únicos y 4 vistas. El contrato HTTP conserva sus 140 rutas.

## Prueba en pantalla

1. Como administrador, abrir Gestión → Cursos → Editar curso.
2. En Certificado de finalización, cargar una cantidad de prueba, por ejemplo 12,5, y marcar Habilitar certificado. El dato definitivo lo define Juan.
3. Guardar: la ficha debe mostrar Habilitado y 12,5 horas. Recargar debe conservarlo.
4. Cambiar solo la descripción: horas y habilitación deben permanecer intactas.
5. Vaciar las horas con el certificado habilitado: debe impedir guardar. El valor cero tampoco es válido.
6. Deshabilitar y limpiar las horas: permite guardar NULL.
7. Como alumno, comprobar que se conserva el curso y el progreso. Esta etapa no presenta todavía un botón para emitir.

## SELECT de validación

```sql
USE DB_FactoreDesa_04102026;

SELECT id, titulo, estado,
       certificado_habilitado, certificado_carga_horaria
FROM cursos
ORDER BY id;

-- Esperado: cero mientras no se implemente la emisión.
SELECT COUNT(*) AS certificados_emitidos
FROM curso_certificados;

-- Esperado: cero.
SELECT COUNT(*) AS configuraciones_incoherentes
FROM cursos
WHERE certificado_habilitado = 1
  AND (certificado_carga_horaria IS NULL OR certificado_carga_horaria <= 0);
```

La siguiente etapa utilizará la plantilla de Juan y generará un PDF con nombre, curso, horas y fecha original de emisión.

## Validación realizada

Suite completa aprobada: 51 pruebas principales del backend en Node 18.16 y 148 del frontend. Cuatro recorridos en navegador con React y Express reales: guardar y recargar, horas obligatorias y limpieza, edición parcial y pantalla móvil, aislamiento del alumno. Pruebas sobre SQLite aislado; la aplicación de la migración a MySQL DESA se confirma con `modelos:db` en la instalación.
