# Factor E — etapa 5: recuperación de compras

Entrega pequeña de backend. No agrega tablas, campos, rutas, dependencias ni pantallas. Requiere la etapa 4 instalada. No copiar otra vez las migraciones anteriores. No modifica `.env`.

## Instalación y verificación

Detener el backend, respaldar src/Scripts/Tests/docs, extraer el ZIP y ejecutar:

```bash
node Scripts/verificar-reconciliacion.js
npm run modelos:verificar
npm run modelos:db
npm run rutas:verificar
npm test
```

La estructura permanece en 21 modelos, 232 campos, 76 asociaciones, 104 rutas. Los tests de Mercado Pago simulan las respuestas; no usan credenciales reales ni cobran. El adaptador SQLite no valida concurrencia o DDL de MySQL Server. La validación `modelos:db` contrasta la estructura real instalada.

## Operación que se incorpora

Si la respuesta al crear un link se pierde, la compra queda CREANDO/INCIERTA. Reconciliar busca por la referencia UUID, recupera exactamente una preferencia y consulta sus datos completos. Compara vendedor de prueba, referencia, IDs de cursos, cantidades, moneda, importes, ventana de vencimiento y URL de sandbox con lo congelado en la compra. Guarda el link y audita la recuperación dentro de una transacción.

Una preferencia conocida se conserva: no hay una nueva búsqueda/creación del link. Si el estado original CREANDO termina mientras se recupera ese mismo ID, la respuesta original admite el registro ya recuperado y evita repetir la auditoría.

Cero resultados no prueba que el proveedor no creó el link. Varios resultados requieren revisar cuál corresponde; nunca se elige uno arbitrario ni se vuelve a crear otro. En ambos casos se informa error y se mantiene bloqueado el intento de creación.

La revisión también busca los pagos de la referencia, de todos los estados, con fecha de creación desde el inicio de la compra hasta el momento de consulta. Recorre todas las páginas, incluyendo registros posteriores a 100, y agrega IDs ya guardados aunque la búsqueda no los devuelva. El estado que muestra Search no paga la compra: cada ID se consulta mediante GET de pago y orden comercial y pasa por los controles transaccionales de la etapa 4.

Las consultas externas usan exclusivamente GET. No se emiten cobros, no se crean otras preferencias, no se reintegran pagos ni se resuelven automáticamente incidencias. No crea fichas CRM, cuentas ni asignaciones.

## Uso administrativo, después de configurar Developers

Conservar MP_HABILITADO=false durante esta instalación. Todavía no ejecutar el comando contra Mercado Pago. Después configuraremos las credenciales de PRUEBA y las URLs públicas HTTPS juntos.

El comando se ejecuta desde la carpeta del backend por alguien con acceso local autorizado a la base:

```bash
node Scripts/reconciliar-compra.js --referencia UUID_DE_LA_COMPRA
```

El placeholder se reemplaza por `compras.referencia`. No usar el ID numérico de la compra ni el token privado. No incluir contraseña ni Access Token en la línea de comandos. El archivo `.env` se carga mediante la configuración existente de la base. Puede funcionar mientras el backend está iniciado.

No hay ruta pública nueva ni un botón todavía. Este servicio interno se conectará posteriormente al módulo administrativo de Compras mediante sesión ADMIN y CSRF; no publicar una ruta que acepte una referencia libre como identidad del comprador.

La salida contiene referencia, estado, preferencia_recuperada, pagos_consultados, pagos_registrados, pagos_en_revision, completa y códigos de errores. No imprime nombres, emails, hashes, tokens ni JSON del proveedor.

- `completa=true`: todas las consultas de pagos de esta revisión terminaron. **No significa que todos los pagos estén aprobados ni que la compra pueda entregar cursos**; revisar `estado` y `pagos_en_revision`.
- `completa=false`: un pago no pudo verificarse. Los anteriores pueden haberse confirmado porque cada pago tiene una transacción propia. El CLI sale con código 2. Repetir la misma referencia verifica lo faltante sin duplicar COMPRA_PAGADA.
- Error de búsqueda, recuperación o configuración: código de salida 1. No interpretar el error como pago rechazado ni volver a cobrar.
- `sin_intento_enviado=true`: la compra no inició un pago. No se contacta al proveedor.

La protección de ejecución simultánea es por proceso; dos comandos en procesos distintos pueden consultar el proveedor. La recuperación bloquea la compra al guardar y la confirmación del pago utiliza los bloqueos de la etapa 4 para conservar unicidad e idempotencia en MySQL.

## Límites y recuperación histórica

Preferences Search solo devuelve los últimos 90 días. Si falta el ID de una preferencia antigua, un resultado vacío requiere investigación administrativa; no resetea la compra. Un ID conocido permite consultar el recurso directamente.

Payments Search limita el historial a los últimos 12 meses. Esta entrega rechaza la búsqueda global de compras con 364 días o más, para no anunciar falsamente una revisión completa. La recuperación de casos históricos por IDs conocidos queda para otra etapa.

Una compra con más de 10.000 pagos se señala como anómala y se detiene explícitamente. No se anuncia éxito con un listado recortado. Si la paginación cambia, se repite un ID o la respuesta devuelve otra referencia, se rechaza la búsqueda antes de aplicar sus pagos. Volver a ejecutar puede recuperar cambios posteriores a la consulta.

Si un fallo ocurre después de recuperar la preferencia pero antes de revisar todos los pagos, el link recuperado permanece registrado y la revisión de pagos se reintenta. La recuperación no amplía el vencimiento original.

## Próximo paso

Tras validar esta entrega, comenzar la configuración guiada de la aplicación Checkout Pro en Mercado Pago Developers con vendedor/comprador y credenciales de PRUEBA. Preparar las URLs públicas HTTPS de desarrollo para notificaciones y retorno. No hacer cobros reales ni una prueba integral hasta completar la pantalla de resultado, verificación de identidad y entrega del curso.

Después: pago desde el carrito, creación/vinculación de cuenta y ficha CRM, asignación con duración congelada y Gestión → Compras para Juan.

Documentación oficial consultada 13/10/2026:

- https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/search-preferences/get
- https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/get-preference/get
- https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro-preferences/search-payments/get
- https://www.mercadopago.com.ar/developers/es/news/2025/03/04/Updates-on-the-Preferences-and-Merchant-Orders-APIs
