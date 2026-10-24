# Mi agenda · Compra y habilitación automática

Benjamin Orellana · 24/10/2026

## Flujo

Una cuenta activa entra a Mi agenda y elige Ver acceso a Mi agenda. El sistema muestra el precio y la duración definidos por Juan. La compra se vincula a esa cuenta desde su creación: no pide otro nombre, email ni cuenta de destino.

Se genera una compra con plazo de 15 minutos y un enlace dinámico de Checkout Pro. Se reutilizan el vendedor, las credenciales de prueba, la firma del webhook y la reconciliación existentes. El retorno de Mercado Pago es `/mi-agenda/compras/:referencia`; sus parámetros no acreditan un pago.

Solo un pago aprobado, acreditado y verificado por el servidor, con vendedor, preferencia, importe, moneda y plazo correctos, permite entregar el acceso. El webhook habilita la agenda aunque el comprador haya cerrado la página. Al volver, el comprador ve Abrir mi agenda, sin asignación manual.

## Condiciones y renovación

- Precio y duración se congelan en `agenda_compras`, separados de los items de cursos. Cambiar la configuración no cambia una compra creada.
- El acceso nuevo comienza al entregar el pago confirmado. Un acceso activo con vencimiento se renueva desde el mayor entre el vencimiento vigente y ahora. Se conserva un inicio programado posterior.
- Un acceso vencido comienza el período nuevo desde ahora; los cronómetros antiguos se cierran en el vencimiento anterior para no sumar tiempo del intervalo sin acceso.
- Sin vencimiento guarda cantidad y vencimiento NULL. Una agenda que ya era ilimitada se conserva, incluso si ese cambio administrativo ocurrió durante el pago.
- Tareas, notas, pilares y preferencias se conservan. Comprar no reinicia la agenda.
- Suspensión o revocación impiden comenzar un pago. Si ocurren después de emitir el enlace, el pago se registra y la entrega espera revisión. Tras la revisión administrativa, Actualizar habilitación aplica la compra pagada.
- Cada compra tiene un único comprobante. Recargar, repetir el webhook o recuperar un fallo de auditoría no suma períodos nuevamente ni restaura un permiso revocado después de una entrega.
- Un pago pendiente, rechazado, fuera de plazo, reintegrado, duplicado o con importe distinto no habilita un acceso nuevo. Reintegros o disputas posteriores quedan en revisión para administración; no borran contenido ni revierten permisos automáticamente.
- Pausar la venta impide crear compras e iniciar enlaces desde Factor E. Un enlace ya emitido conserva su plazo original en Mercado Pago.

## Seguridad y recuperación

Las seis rutas nuevas requieren cookie de sesión y contraseña actualizada; las escrituras también exigen origen permitido y CSRF. La referencia por sí sola no permite consultar, pagar, cancelar ni entregar. El usuario de destino procede de la sesión. La API rechaza precios, emails, IDs de cuenta y estados enviados libremente.

El navegador guarda únicamente una referencia por cuenta antes del POST. Una respuesta perdida conserva la misma compra. Al comenzar el enlace, el servidor reserva CREANDO antes de contactar al proveedor. Un resultado incierto bloquea otro POST y se recupera con el reconciliador existente:

```bash
node Scripts/reconciliar-compra.js --referencia REFERENCIA_DE_LA_COMPRA
```

Una entrega interrumpida se recupera al repetir el webhook o mediante Actualizar habilitación. La consulta GET no crea compras ni permisos. El frontend consulta el estado durante tres minutos mientras está visible y ofrece actualización manual después.

## Instalación DESA

1. Detener el backend antes de extraer el paquete.
2. Respaldar ambos proyectos y la base DESA.
3. Extraer el ZIP en el directorio personal.
4. Ejecutar `docs/sql/AGENDA_ETAPA6.sql` en `DB_FactoreDesa_04102026`.
5. Ejecutar `npm run modelos:db`, `npm run rutas:verificar` y `node --test Tests/agenda-compras.test.js` en el backend.
6. Ejecutar `node --test Tests/agenda-compra.test.js` en el frontend.
7. Reiniciar backend y frontend.

No se requieren dependencias nuevas ni variables nuevas. El modo PRUEBA existente se conserva. La migración agrega una tabla y puede repetirse. No modifica la configuración comercial, las compras de cursos ni los permisos personales actuales.

El verificador completo reconoce 29 modelos, 319 campos, 104 asociaciones, 45 claves foráneas, 8 claves compuestas, 65 CHECK, 25 índices únicos y 4 vistas. El contrato HTTP contiene 140 rutas.

## Prueba con Mercado Pago sandbox

Mantener activos backend, frontend y túnel HTTPS. Usar ese mismo dominio para ingresar al portal y en `FRONTEND_URL`, `ALLOWED_ORIGINS`, `MP_FRONTEND_URL` y `MP_NOTIFICATION_URL`. Configurar la URL de webhook vigente en la aplicación del vendedor de prueba.

1. Ingresar con un alumno que tenga SIN_ACCESO a Agenda.
2. Abrir Mi agenda → Ver acceso a Mi agenda. Con la configuración actual deben verse $15.000 ARS y 30 días.
3. Comprar acceso. Recargar antes de pagar debe recuperar la misma referencia.
4. Pagar con el comprador y la tarjeta de prueba de Mercado Pago.
5. Volver a Factor E. El pago confirmado debe mostrar Abrir mi agenda; entrar permite guardar pilares y tareas.
6. Ingresar como administrador → Compras: debe figurar Mi agenda, pago validado y entrega confirmada.
7. Repetir la consulta de la misma compra: fechas y cantidad de entregas permanecen iguales.
8. Renovar desde Mi agenda y comprobar que suma el período y conserva el contenido.

Un pago rechazado no habilita la agenda. Un mensaje de éxito en una URL tampoco lo hace. La prueba automatizada usa un proveedor simulado; esta prueba manual confirma la conexión con las credenciales y el túnel de DESA.

## SELECT de validación

```sql
USE DB_FactoreDesa_04102026;

SELECT c.referencia, c.estado AS estado_compra,
       u.email, c.total, c.moneda,
       ac.acceso_duracion_cantidad, ac.acceso_duracion_unidad,
       ac.entregada_en, ac.accion,
       a.estado AS estado_acceso, a.inicio_en, a.vence_en,
       (SELECT COUNT(*) FROM auditoria_eventos e
        WHERE e.entidad = 'compras' AND e.entidad_id = c.id
          AND e.accion = 'COMPRA_ENTREGADA') AS entregas
FROM agenda_compras ac
JOIN compras c ON c.id = ac.compra_id
JOIN usuarios u ON u.id = ac.usuario_id
LEFT JOIN agenda_accesos a ON a.id = ac.acceso_id
ORDER BY c.id DESC;

SELECT c.referencia, p.mp_pago_id, p.estado, p.validacion,
       p.motivo_revision, p.importe, p.modo_prueba
FROM agenda_compras ac
JOIN compras c ON c.id = ac.compra_id
LEFT JOIN compra_pagos p ON p.compra_id = c.id
ORDER BY c.id DESC, p.id;
```

Las fechas de `agenda_accesos` muestran el permiso actual, incluidas las renovaciones posteriores. Las fechas de `agenda_compras` conservan el comprobante de cada entrega.

## Verificación realizada

51 pruebas principales del backend en Node 18.16 y 145 del frontend aprobadas. Cinco recorridos en Chromium contra React y Express reales: oferta móvil/escritorio, compra y retorno, renovación conservando contenido, aislamiento entre cuentas/gestión y retorno con sesión cerrada. Mercado Pago simulado y SQLite aislado; no se ejecutó esta migración en MySQL DESA desde este entorno.
