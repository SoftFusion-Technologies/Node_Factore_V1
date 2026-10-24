# Mi agenda · Etapa 5 · Configuración comercial

Benjamin Orellana · 22/10/2026

## Qué incorpora

El administrador dispone de **Venta de agenda** en el menú. Puede guardar el precio en ARS, una duración por días o meses o Sin vencimiento, y preparar o pausar la venta. No necesita tener habilitada su agenda personal para administrar estas condiciones.

La instalación crea `agenda_venta_configuracion`, con una única fila. Comienza con precio `0.00`, venta pausada y duración editable de un mes. El precio definitivo lo define Juan. Repetir la migración conserva las condiciones que ya se hayan guardado.

Este paso configura las condiciones comerciales. El cobro por Mercado Pago y el desbloqueo de la agenda después del pago se incorporan en la siguiente etapa. No se agregan llamadas al proveedor, preferencias de pago ni compras de agenda en este paquete.

Los permisos individuales y el contenido existente se conservan. Pausar la venta no suspende a los usuarios actuales. Tampoco se modifican los precios o las compras de cursos.

## Instalación en DESA

1. Detener el backend con Ctrl+C antes de extraer: los modelos nuevos requieren la tabla nueva.
2. Respaldar ambos proyectos y la base DESA.
3. Extraer el ZIP en el directorio personal. Contiene carpetas `Node_Factore_V1` y `sist-factore-front-desa`.
4. Desde el backend, ejecutar `docs/sql/AGENDA_ETAPA5.sql` en `DB_FactoreDesa_04102026`.
5. Ejecutar `npm run modelos:db`, `npm run rutas:verificar` y `node --test Tests/agenda-venta.test.js`.
6. Desde el frontend, ejecutar `node --test Tests/agenda-venta-entradas.test.js`.
7. Volver a iniciar el backend con `nodemon server.js` y el frontend con `nvm use 20` y `npm run dev`.

No se requieren paquetes nuevos ni cambios en `.env`. Los verificadores anteriores se actualizan para reconocer el nuevo modelo.

## Prueba en pantalla

1. Entrar como administrador y abrir **Venta de agenda**.
2. Deben verse **Por definir**, **1 mes** y **Venta pausada** en la primera instalación.
3. Cargar un precio de prueba, por ejemplo `15000`, y elegir duración. Se aceptan punto o coma para los centavos, sin separador de miles.
4. Guardar y recargar: deben conservarse el precio y la duración.
5. Elegir **Sin vencimiento**: desaparece la cantidad y se guarda como NULL.
6. Marcar **Preparar venta online** y guardar. Se exige precio positivo. En esta etapa se conserva la preparación comercial; no se ofrece todavía el cobro de la agenda.
7. Desmarcar la preparación de venta y guardar. Los accesos personales siguen con sus fechas anteriores.
8. Ingresar como alumno: no debe aparecer este menú. La API también exige ADMIN.

Si dos pestañas editan la misma configuración, la segunda detecta la versión anterior y permite actualizar antes de volver a editar. Si se pierde la respuesta de una escritura, se ofrece **Actualizar y comprobar**, sin repetir el PATCH automáticamente.

## Rutas y reglas

- `GET /api/admin/agenda/venta`: configuración privada, solo lectura.
- `PATCH /api/admin/agenda/venta`: sesión ADMIN, contraseña actualizada, origen permitido, CSRF y versión vigente.
- Campos editables: `precio`, `acceso_duracion_cantidad`, `acceso_duracion_unidad`, `venta_habilitada`.
- Moneda fija: ARS. Precio decimal exacto de hasta 12 enteros y 2 decimales.
- Días: 1 a 3650. Meses: 1 a 120. Sin vencimiento: cantidad NULL.
- Preparar venta requiere precio mayor a cero. Pausada permite guardar cero como precio pendiente.
- Autor y fechas se toman del servidor; cada cambio efectivo se audita como `AGENDA_VENTA_CONFIGURADA`.

## SELECT de validación

```sql
USE DB_FactoreDesa_04102026;

SELECT id, precio, moneda, acceso_duracion_cantidad,
       acceso_duracion_unidad, venta_habilitada,
       version, actualizado_por, actualizado_en
FROM agenda_venta_configuracion;

SELECT usuario_id, estado, inicio_en, vence_en
FROM agenda_accesos
ORDER BY usuario_id;

SELECT id, usuario_id, accion, entidad_id, creado_en
FROM auditoria_eventos
WHERE accion = 'AGENDA_VENTA_CONFIGURADA'
ORDER BY id DESC;
```

El verificador completo debe reconocer 28 modelos, 305 campos, 98 asociaciones, 42 claves foráneas, 8 claves compuestas, 60 CHECK y 24 índices únicos. Se conservan las 4 vistas.

## Validación del paquete

Pruebas de entradas y HTTP sobre SQLite aislado; permisos, CSRF, validación del precio, ventanas de duración, restricciones de la nueva tabla, conflictos de versión y rollback de auditoría. La prueba comprueba que los permisos personales y su contenido se conservan exactamente.

También se revisa la pantalla contra las rutas reales, incluyendo dos pestañas, pérdida de respuesta, vistas móviles y acceso de un alumno. No se usan credenciales DESA, Mercado Pago ni correo.
