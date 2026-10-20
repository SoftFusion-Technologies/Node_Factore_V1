# Factor E · Entrada directa al campus
Benjamin Orellana - 19/10/2026

Después de verificar el email y entrar con su contraseña, el alumno pasa directamente a Mis cursos. La ruta de la compra consulta su estado, solicita la entrega autenticada y navega al campus; ya no solicita otra confirmación de asignación.

La bienvenida aparece después del recibo confirmado de una entrega nueva, con Empezar y el WhatsApp de Juan (5493816233317). El aviso se retira del estado de navegación al mostrarse. Retomar una compra ya entregada conserva su recibo, no agrega tiempo y no repite la bienvenida.

Se mantienen la cookie privada de compra, la sesión de alumno, ambos CSRF, el origen autorizado, el email coincidente y la verificación del pago del servidor. Suspensión, revocación y permisos especiales conservan la revisión administrativa. Un error de red detiene la operación; Volver a intentar usa la misma compra y su entrega idempotente. No se habilita ningún curso desde parámetros de retorno de Mercado Pago.

La creación, activación, recuperación y cambio de contraseña admiten entre 8 y 60 caracteres Unicode. No hay recorte ni conversión del contenido. La verificación de hashes anteriores conserva el límite original de 128 caracteres, por lo que ninguna cuenta existente debe cambiar la clave por esta actualización. scrypt, cookies, revocación de sesiones y límites de intentos mantienen su implementación.

El ZIP incluye el botón Crear mi cuenta en azul y el texto Ingresar y ver mis cursos. No requiere SQL, dependencias nuevas ni cambios en .env.

## Validación realizada
- Node 18: ocho casos principales aprobados sobre política, compatibilidad de claves anteriores, registro/activación HTTP, autenticación, entrega y CLI.
- Frontend: 119 pruebas aprobadas.
- Navegador real: compra pagada, correo local mediante SMTP STARTTLS, activación con ocho caracteres, login, entrega automática, modal, WhatsApp, recarga, reingreso idempotente, error de red con reintento y móvil. Seis verificaciones aprobadas.
- Mercado Pago simulado y SQLite aislado para las pruebas. No se efectuaron pagos ni envíos externos.

## Comprobación manual
1. Conservar las terminales de buzón, túnel y frontend; reiniciar backend con bash Scripts/correo-prueba.sh backend.
2. Una compra ya entregada abre Mis cursos sin sumar tiempo ni mostrar otra bienvenida.
3. Para una compra pagada que todavía no fue entregada, ingresar con la cuenta del mismo email desde el navegador original. Se incorporará automáticamente y aparecerá la bienvenida.
4. En una cuenta nueva, verificar el correo y elegir una contraseña; al ingresar se abre directamente el campus.
5. Una compra pendiente o en revisión no abre una bienvenida de éxito. Un acceso revocado no se reactiva con esta actualización.

Las cuentas que ya fueron creadas y activadas no deben volver a crearse. Para validar el flujo no es necesario repetir el pago de una compra pagada.
