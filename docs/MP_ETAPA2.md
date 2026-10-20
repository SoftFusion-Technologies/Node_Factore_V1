# Etapa 2: compras antes del pago

Se agregan compras y compra_items: 20 tablas/modelos, 212 campos, 74 asociaciones,
33 FK, 24 CHECK, 18 índices únicos y las cuatro vistas existentes.

El servicio compra.service.js registra el comprador (nombre/email), los cursos
seleccionados y los precios y duraciones que tenían en ese momento. Los importes
se calculan como centavos enteros y se guardan como DECIMAL; no acepta precios
enviados por el visitante. Solo admite cursos publicados, visibles, con venta
online preparada, precio positivo y moneda ARS.

La compra comienza PENDIENTE y dura 15 minutos. Su vencimiento es calculado sin
cron. Un reintento con la misma referencia UUIDv4 y token privado recupera la
misma compra, incluso si el precio/duración fueron editados. Cambiar el contenido
de la solicitud bajo la misma referencia se rechaza. Para comenzar un intento
nuevo se generan referencia y token nuevos.

El llamador genera un token aleatorio de 32 bytes antes de enviar la solicitud;
solo su hash se almacena. Consultar o cancelar exige referencia y token. Una
referencia sola no permite acceder. El email indicado todavía no acredita
identidad ni vincula cuentas existentes: usuario_id queda NULL.

Las tres operaciones crearCompra, obtenerCompra y cancelarCompra son servicios
internos para los próximos controladores. Esta entrega no agrega rutas públicas,
pantallas ni pagos de Mercado Pago. Tampoco crea cuentas o asigna cursos, y no
hay ninguna operación pública para marcar PAGADA.

No agrega pedidos ficticios a DESA. Tras instalar, ambas tablas estarán vacías.
Las pruebas usan SQLite aislado y no verifican bloqueos/collation ni ejecutan
DDL sobre MySQL Server. modelos:db verifica la instalación nativa en DESA.

El próximo paso agregará las rutas de compra y la preferencia de Checkout Pro,
confirmación verificable de pago y recuperación del recorrido del comprador.
Antes de generar el pago se validarán vigencia y disponibilidad, y se usará
el importe guardado en la compra. Una compra vencida requiere una nueva,
con los precios y duraciones vigentes en ese momento.

Instalación: detener backend, respaldar código y MySQL, extraer ZIP, ejecutar
docs/MP_ETAPA2_COMPRAS.sql, modelos:db, rutas:verificar y npm test. El frontend
mantiene el botón y el comportamiento actuales durante esta etapa.
