# Etapa 3: rutas de compra y link de Checkout Pro

Son 20 modelos, 216 campos, 74 asociaciones, 33 FK, 25 CHECK, 18 índices
únicos, cuatro vistas y 103 rutas. El frontend mantiene su comportamiento.

## API

Todas las rutas exigen `X-Compra-Token` (64 caracteres hexadecimales generados
aleatoriamente por el llamador), verifican origen, limitan solicitudes y
rechazan filtros/secretos en la URL. No autentican por IDs o email enviados.

- POST /api/checkout/compras: cuerpo referencia UUIDv4, nombre, email y curso_ids.
- GET /api/checkout/compras/:referencia: consultar la compra del token.
- POST /api/checkout/compras/:referencia/cancelar: cuerpo vacío. Solo compras
  que no hayan enviado una preferencia al proveedor pueden cancelarse localmente.
- POST /api/checkout/compras/:referencia/mercadopago: cuerpo vacío; genera o
  recupera la preferencia de la compra usando importes/duraciones guardados.

La respuesta de creación es 201; recuperar la misma solicitud devuelve 200.
Los precios, usuario, estado de pago y vencimiento no pueden enviarse libremente.

## Mercado Pago

El generador usa POST https://api.mercadopago.com/checkout/preferences con items,
external_reference y vigencia limitada al vencimiento original de la compra.
Devuelve únicamente sandbox_init_point validado, nunca credenciales.
Esta etapa admite MP_MODO=PRUEBA. MP_HABILITADO es false por defecto; las rutas
de compra funcionan aunque Mercado Pago no esté configurado.

MP_HABILITADO=true requiere MP_ACCESS_TOKEN de prueba, MP_FRONTEND_URL pública
HTTPS y MP_NOTIFICATION_URL pública HTTPS. La plantilla .env.mercadopago.example
contiene solo variables vacías; copiar las necesarias al .env actual sin
reemplazar su configuración de MySQL/cookies. El token privado permanece en
el backend y no debe subirse a Git ni pegarse en el chat.

Importante: este bloque genera el link; todavía no implementa el receptor de
notificaciones, la pantalla /compras/:referencia/resultado ni la creación de
cuenta/asignación. No completar cobros reales ni habilitar producción. Antes
de una prueba completa de pago hay que incorporar esos siguientes bloques.

La solicitud se registra CREANDO antes del POST externo. Timeout, respuesta
inválida o error de DB dejan INCIERTA y bloquean un nuevo POST a ciegas. CREANDO
tras una interrupción también requiere conciliación. Nunca se promete
idempotencia del endpoint de preferencias: se conserva el único intento y se
reutiliza una preferencia confirmada. La conciliación se incorporará con pagos.
Crear el link o recibir parámetros de retorno no marca la compra PAGADA.

## Validación

Detener backend, respaldar código/MySQL, extraer ZIP, ejecutar
docs/MP_ETAPA3_CHECKOUT.sql, modelos:db, rutas:verificar y npm test.
No sobrescribir .env. Las pruebas usan HTTP real con SQLite aislado y respuestas
simuladas de MP; no contactan al proveedor ni crean pagos reales.

Con servidor local levantado y un curso publicado, visible, con venta preparada
y precio positivo en ARS: node Scripts/probar-compra-http.js --curso 7.
El script guarda una compra ficticia y la cancela, sin generar preferencia ni
contactar Mercado Pago. Los registros se conservan en compras/compra_items
para auditoría. Si Kit sigue borrador, la prueba devuelve CURSO_NO_COMPRABLE.

Referencias oficiales:
https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-settings/term-of-preference
https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/configure-back-urls
https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications
