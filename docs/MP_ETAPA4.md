# Factor E — etapa 4: confirmar pagos de prueba

Esta entrega incorpora la recepción de notificaciones y el registro de pagos de Checkout Pro. No crea usuarios, fichas CRM ni asignaciones. No incorpora todavía el carrito con pago, la pantalla de resultado ni el panel administrativo de compras.

## Instalación

1. Detener el backend con Ctrl+C; mantener el frontend sin cambios.
2. Respaldar la base y los archivos antes de extraer el parche.
3. Ejecutar `docs/MP_ETAPA4_PAGOS.sql` en DB_FactoreDesa_04102026. Requiere las etapas 1, 2 y 3 instaladas; no modifica compras ni cursos existentes.
4. Ejecutar `node Scripts/verificar-pagos.js`, `npm run modelos:verificar`, `npm run modelos:db`, `npm run rutas:verificar` y `npm test`.
5. Iniciar con `nodemon server.js`.

Esperado: 21 tablas, 4 vistas; 21 modelos, 232 campos, 76 asociaciones, 34 FK, 5 FK compuestas, 29 CHECK, 19 índices únicos; 104 rutas en 18 módulos.

Los tests usan HTTP local y respuestas de Mercado Pago simuladas. No se conectan a MySQL DESA ni cobran dinero. El adaptador SQLite no valida los bloqueos ni DDL de MySQL; `modelos:db` contrasta la estructura del servidor real del usuario. El test de reversión de auditoría imprime un ERROR_CRM controlado; el resultado final debe ser fail 0.

## Qué se agregó

- POST `/api/mercadopago/webhook`: autenticación con HMAC-SHA256 de la URL `data.id`, `x-request-id` y el `ts` de `x-signature`, comparación constante. Firma antes de leer el JSON (16 KB) y consultar al proveedor.
- El ID del cuerpo debe coincidir con el ID firmado y el evento debe ser `payment.created` o `payment.updated`. Parámetros de retorno, cookies, email del pagador y status del cuerpo no confirman el pago.
- GET `/v1/payments/{id}` y GET `/merchant_orders/{id}` con el Access Token exclusivamente en el backend, endpoints fijos, sin redirecciones y con un plazo total de 10 segundos para ambas consultas.
- Solo modo PRUEBA, `live_mode=false` y vendedor esperado por `MP_COLLECTOR_ID`. La orden debe enlazar el pago con la preferencia exacta que generamos para la compra.
- `compra_pagos`: un registro por ID de pago de MP, datos operativos mínimos; no JSON del pagador ni tarjetas.
- Bloqueo de la compra en transacción: todos sus pagos se procesan bajo la misma fila; registro, estado PAGADA y auditoría se confirman juntos o se revierten juntos.
- Reintentos del mismo estado no repiten la auditoría COMPRA_PAGADA. Una respuesta con fecha de actualización anterior a la guardada no retrocede el estado.
- El GET privado de la compra agrega `pago.requiere_revision` sin exponer detalles del pagador ni claves.

## Reglas de aceptación y revisión

Para marcar PAGADA se requiere pago `approved/accredited`, importe original exacto y positivo en ARS, suma coherente de items y fecha de aprobación dentro de la ventana de compra. Las comisiones no se restan del importe esperado. Ni la duración ni el precio actuales del curso reemplazan lo congelado en los items.

Pendiente, rechazado o autorizado se registran, pero no pagan la compra. Un pago aprobado dentro del plazo y notificado más tarde sí puede confirmarse. Una aprobación fuera del plazo se registra para revisión; no se ignora el dinero recibido ni se habilita automáticamente.

Importe/moneda distintos, segundo pago aprobado, reintegros, contracargos, disputa o datos de estado contradictorios quedan REVISION con motivo. Una incidencia ya registrada no se limpia automáticamente por una nueva respuesta approved. La resolución administrativa de incidencias se incorporará en otra etapa.

PAGADA conserva el hecho histórico de haber confirmado el cobro. Un reintegro posterior queda en el registro del pago y activa `requiere_revision`; no convierte la compra otra vez en PENDIENTE. **La futura creación de cuenta/asignación deberá consultar también estos registros y bloquear las incidencias**, no usar únicamente compras.estado. Esta entrega todavía no tiene asignaciones automáticas que revocar.

Sin firma o con firma incorrecta: 401. Sin configuración: 503. Fallo de API, preferencia sin resolver o vendedor/modo incorrectos: no hay confirmación ni ACK de éxito, para permitir reintentar. Solo se responde 200 después de terminar la transacción o identificar un evento ya procesado/ajeno a nuestras compras. Si el proceso cae antes de confirmar, el proveedor debe reintentar. No se hace procesamiento en memoria después de enviar 200.

No se aplica un corte de antigüedad al ts firmado porque Mercado Pago reintenta notificaciones. Cada reenvío exige HMAC y una nueva consulta al estado del proveedor; la base aplica idempotencia y compara la fecha de actualización del recurso.

Una preferencia INCIERTA sin ID local sigue bloqueada: no se crea otro link ni se confirma el pago hasta reconciliarla. La reconciliación de preferencias y un mecanismo de consulta periódica/manual para recuperar notificaciones faltantes quedan para la siguiente etapa; todavía no iniciar pruebas completas de pago ni cobros reales.

## Configuración de Developers: cuándo y qué necesitaremos

Después de validar esta instalación prepararemos juntos la aplicación y el entorno de prueba en Mercado Pago Developers. No es un link fijo: se configura una vez la aplicación/vendedor y el backend genera una preferencia por compra con importe y vencimiento propios.

Ahora conservar `MP_HABILITADO=false`. No cambiar `.env` ni copiar la plantilla encima de la configuración de MySQL/cookies. No pegar Access Token, secreto de Webhooks ni credenciales en el chat o el frontend.

Para la próxima sesión de configuración se necesitarán:

- Aplicación de Factor E, integración Checkout Pro.
- Credencial de PRUEBA correspondiente al vendedor, comprador de prueba distinto y tarjetas de prueba.
- ID del vendedor de prueba esperado (`MP_COLLECTOR_ID`).
- Secreto de la aplicación generado en Webhooks (`MP_WEBHOOK_SECRET`), distinto del Access Token.
- URL pública HTTPS del backend y del frontend de desarrollo. Un túnel o entorno DESA puede servir; localhost no es alcanzable desde Mercado Pago.
- Webhooks de **Pagos** hacia `https://TU-BACKEND-DE-PRUEBA/api/mercadopago/webhook`, concordante con MP_NOTIFICATION_URL.

El simulador de notificaciones del panel necesita un ID de recurso consultable en el entorno configurado; enviar un ID arbitrario puede dar 503 y no demuestra un cobro válido. No usar dinero real. Todavía falta completar la pantalla de resultado, verificación de identidad y entrega del curso antes de la prueba integral.

Documentación oficial consultada 13/10/2026:

- https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
- https://www.mercadopago.com.ar/developers/es/docs/wallet-connect/notifications (plantilla HMAC)
- https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/get-payment/get
- https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/merchant-orders/get-merchant-order/get

## Próximos pasos acordados

1. Recuperación/reconciliación de preferencias y pagos; configuración de Developers de prueba.
2. Frontend: datos del comprador, link dinámico, vencimiento y resultado consultado al backend.
3. Verificación de identidad, crear o vincular cuenta y ficha CRM, asignar los cursos con su duración congelada y conservar el progreso existente.
4. Gestión → Compras: compradores, cursos, totales, estados, incidencias, cuenta/ficha vinculada y entrega de accesos; distinguir clientes llegados por compra online.

Tests, fixtures SQL y el adaptador Python se conservan en Git para reproducir las verificaciones. No son archivos de ejecución del CRM ni datos de la base real. `.env`, archivos subidos, backups y logs permanecen fuera del repositorio.
