# Factor E · Etapa 8B · Crear cuenta desde una compra pagada

Benjamin Orellana · 19/10/2026

## Recorrido del comprador

Desde el resultado de una compra PAGADA sin revisión:

1. **Ya tengo cuenta · Asignar mi compra**: ingresar con el ALUMNO cuyo email coincide con la compra; confirmar la asignación del paso 8A.
2. **Crear mi cuenta**: usar el nombre y el email guardados en esa compra. El servidor crea una ficha CRM nueva y una cuenta ALUMNO PENDIENTE sin contraseña, y envía la activación al email del comprador.
3. El destinatario abre el enlace y elige su contraseña. El enlace verifica el email; vence en 48 horas y es de un solo uso. El servidor guarda únicamente su hash.
4. Después de activar, iniciar sesión. El frontend vuelve a la asignación de esa compra; confirmar para incorporar el curso al campus. El plazo empieza conforme al paso 8A.

No se usan las credenciales del comprador de prueba de Mercado Pago para entrar al campus. El pago y la cuenta de Factor E son identidades separadas.

El email de la compra debe ser real y accesible para esta prueba. Si se usó una dirección `@example.com` o `@example.invalid`, no recibirá correo. No hay que cambiar registros a mano para sortear la verificación: usar una nueva compra de sandbox con un email real, o continuar la entrega anterior con el flujo de cuentas existentes.

El enlace debe abrirse en la misma dirección HTTPS de Factor E. Si el navegador de correo es diferente del navegador donde se compró, puede activarse allí, pero después hay que volver al navegador original para iniciar sesión y asignar la compra. La activación por email no traslada ni revela la cookie privada de compra.

## Cuentas existentes y CRM

Una respuesta pública no informa si el email ya tenía cuenta. Si existe una cuenta, se envía una indicación de ingreso, sin regenerar activaciones ni recuperaciones ajenas, ni modificar contraseña, ficha, rol o sesiones. Si es una cuenta pendiente creada por el flujo manual de Juan, conserva su enlace previo y la gestión manual existente.

Los reenvíos de activación solo pueden actuar sobre la cuenta pendiente que ESTA compra creó y documentó en auditoría. Se verifica nuevamente su rol, estado, email y ficha. Un doble clic o una respuesta perdida dentro del minuto devuelve un acuse sin volver a emitir el token. Se admiten hasta cinco solicitudes por compra en 24 horas, además del límite HTTP de checkout. Después del minuto, un reenvío válido invalida el enlace anterior de esa cuenta pendiente.

Una ficha CRM previa sin cuenta no se fusiona automáticamente por coincidir su email, que no es único en CRM. En ese caso puede quedar una ficha nueva para que Juan revise la coincidencia. No se apropia de contactos previos ni sus notas privadas.

## Configuración de correo

No hay migraciones de MySQL: se reutilizan usuarios, fichas, tokens y auditoría. La única dependencia agregada es `nodemailer@9.1.1`, compatible con el backend Node 18.16. Ejecutar `npm ci` al instalar.

Copiar las variables de `CORREO_CUENTAS.env.example` al `.env` existente y completar con el proveedor elegido. El ejemplo no reemplaza la configuración de DB ni Mercado Pago.

- `SMTP_FROM`: dirección simple del remitente, sin nombre, `< >` ni múltiples destinatarios. El nombre visible lo fija el código como Factor E.
- Puerto 465: TLS desde la conexión. Puerto 587: STARTTLS obligatorio. Ambos verifican certificados; no hay opción de desactivar esta comprobación.
- `FRONTEND_URL`: debe coincidir con el HTTPS actual de Factor E, incluido el túnel en DESA. Los enlaces se construyen desde esta configuración, nunca desde Host o cabeceras enviadas por el comprador.
- `CORREO_HABILITADO=false` permite instalar sin enviar correos. Al pulsar Crear mi cuenta, se informará que falta la configuración y no se creará una cuenta parcial.

Con Gmail se necesita configurar el acceso SMTP admitido por la cuenta. Usar la credencial correspondiente del proveedor; no pegar claves en el chat ni guardarlas en git. Con otro proveedor, completar su host y credenciales SMTP. La verificación real de envío queda pendiente hasta que Benja configure su remitente.

## Seguridad y fallos

El POST `/api/checkout/navegador/compras/:referencia/registrar-cuenta` requiere cookie HttpOnly de compra, su CSRF, origen permitido y cuerpo `{}`. El backend vuelve a autorizar la compra y a validar el pago. No acepta email, nombre, usuario, rol, contraseña o URLs de retorno libres.

La cuenta/ficha/token y la auditoría se confirman antes de contactar SMTP. Si falla esa transacción, no se envía un correo. Si el SMTP falla o se pierde la respuesta después, la cuenta queda PENDIENTE sin acceso; revisar bandeja/spam y volver a solicitar el correo después de un minuto. No repetir el pago. No se guardan tokens en claro en la DB ni se devuelven enlaces de activación al checkout.

`COMPRA_CORREO_ACEPTADO` significa aceptación por SMTP, no garantiza llegada a la bandeja de entrada. No se registran respuestas SMTP, credenciales ni texto del correo en logs. Si el registro coincide con otra compra simultánea, la unicidad de usuarios decide; no se crea una segunda cuenta ni se modifica la anterior.

## Instalación y validación

1. Requiere la etapa 8A ya instalada. Respaldar src, Scripts, Tests, docs, package.json y package-lock.json de ambos proyectos.
2. Extraer el parche en HOME y ejecutar `npm ci` en Node_Factore_V1.
3. Backend: `node --test Tests/*.test.js`, `npm run rutas:verificar`, `npm run modelos:db`.
4. Front: `node --test Tests/*.test.js`. Se incluye la corrección explícita a formato de 24 horas de `fechaAcceso`, que resuelve el fallo de seguimiento reportado con Node 20/ICU.
5. Configurar el remitente, reiniciar backend y Vite, y comprobar el registro desde un pago de sandbox con un email propio real.
6. Ejecutar `VALIDACION_MP_ETAPA8B.sql`: la cuenta primero debe estar PENDIENTE y sin asignación; tras verificar email e iniciar sesión, la entrega debe quedar vinculada una sola vez.

Pruebas locales: SMTP y pagos simulados sin correos ni cobros externos; HTTP real con cookies/CSRF y SQLite aislado; alta, activación de un solo uso, login y asignación. Navegador Chromium con HTTPS para el recorrido completo y vista móvil. SQLite no verifica los bloqueos de MySQL. La prueba con el proveedor de correo real y MySQL DESA debe hacerse al configurar el remitente.

Referencias: https://nodemailer.com/smtp · https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
