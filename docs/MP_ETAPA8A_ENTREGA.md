# Factor E · Etapa 8A · Entregar compras a cuentas existentes

Benjamin Orellana · 19/10/2026

## Alcance de esta entrega

Una compra PAGADA puede vincularse desde el navegador original a una cuenta ALUMNO activa, con ficha CRM activa, contraseña actualizada y el mismo email de la compra. Se exige la sesión del portal y la cookie privada de la compra; la referencia pública no otorga permisos. Hay dos CSRF independientes. No se aceptan IDs de usuario, importes, fechas ni estados en el cuerpo.

Desde el resultado pagado: **Asignar a mi cuenta → iniciar sesión si corresponde → confirmar la cuenta → Ir a mis cursos**.

Este paso no incluye el registro público de cuentas nuevas ni envío de correos. Mientras se prueba en DESA, las cuentas nuevas pueden crearse/activarse mediante el flujo manual existente de Gestión → Usuarios. El siguiente paso debe verificar el email antes de crear o vincular una identidad. Nunca resetear una cuenta existente ni revelar su enlace de activación/recuperación al comprador por escribir su email.

## Política de accesos

- Acceso nuevo: COMPLETO y ACTIVO; comienza al confirmar la entrega. Usa la duración congelada de `compra_items`, aunque el curso se haya editado después de comprar.
- Días: días calendario en Argentina. Meses: calendario argentino UTC−3, misma hora; si el mes no tiene ese día, se ajusta a su último día. Ejemplo: 31 de enero + 1 mes = 28/29 de febrero. Se conserva la precisión de milisegundos.
- Acceso completo ACTIVO sin excepciones: suma el período comprado al vencimiento vigente. Si venció, comienza a contar desde ahora. Conserva el inicio original y el progreso. Si estaba programado, conserva su inicio y extiende desde su vencimiento.
- Acceso ilimitado: se conserva ilimitado y se registra la compra entregada sin alterar el historial del acceso.
- SUSPENDIDO, REVOCADO, SELECCION o cualquier excepción por lección: requiere intervención de Factor E. No se consumen la compra ni sus períodos automáticamente.
- Curso archivado/no publicado, ausencia física de videos, pago pendiente, reintegro, pago duplicado o revisión: bloquean la entrega. La ausencia de contenido en cualquier curso revierte la entrega completa.
- Un reintento de la misma compra devuelve su recibo original. No renueva otra vez ni restaura permisos que Juan haya modificado posteriormente.

La asignación y el historial se atribuyen al alumno autenticado que confirma la entrega; la auditoría registra `origen=COMPRA_ONLINE`. No se atribuyen al administrador ni se crea un usuario del sistema.

## Persistencia y límites

Se reutiliza `compras.usuario_id` como vínculo definitivo. El vínculo, todos los accesos, el historial y `COMPRA_ENTREGADA` se confirman en una misma transacción. Una compra previamente vinculada sin ese comprobante queda para revisión; no se intenta reconstruir ni volver a otorgar.

No hay migraciones, dependencias ni variables de entorno nuevas. No se cambia el checkout de Mercado Pago ni se generan pagos al instalar.

El estado PAGADA requiere además un pago aprobado VALIDADO, importe/moneda coincidentes, sin reintegro y sin pagos en revisión. Se usa el resultado de la verificación existente de Mercado Pago. Si un reintegro o contracargo llega después de la entrega, continúa el circuito actual de revisión administrativa; este parche no revoca accesos automáticamente por ese evento.

## Ruta

`POST /api/campus/compras/:referencia/vincular`

Cuerpo `{}`. Cookies: sesión del portal + compra. Cabeceras: `X-CSRF-Token` del portal y `X-Compra-CSRF` obtenido del GET de sesión de compra. Ambas credenciales siguen en cookies HttpOnly; ambos CSRF permanecen en memoria.

## Instalación y prueba DESA

1. Detener backend y Vite, conservar el túnel HTTPS.
2. Respaldar `src`, `Scripts`, `Tests`, `docs` de ambos proyectos y extraer el ZIP en `$HOME`.
3. Backend: `node --test Tests/entrega-compras.test.js Tests/checkout-cookie.test.js Tests/rutas-http.test.js`, `npm run rutas:verificar`, `npm run modelos:db`.
4. Frontend: `node --test Tests/*.test.js` con Node 20, igual que el proyecto existente. Algunas versiones nuevas de ICU cambian el formato horario del test preexistente de seguimiento; no se alteró ese código en esta entrega.
5. Reiniciar con `nodemon server.js` y Vite con el host del túnel permitido, usando el mismo HTTPS y navegador de la compra.
6. Usar una compra de sandbox ya PAGADA cuyo email coincida con un ALUMNO activo. No usar la cuenta ADMIN como destinatario. Si la compra usa un email de prueba, crear/activar su cuenta de alumno con el flujo manual existente.
7. Confirmar la asignación, entrar al campus y reproducir el curso.
8. Volver a la compra, recargar y confirmar de nuevo. El vencimiento y el número de eventos COMPRA_ENTREGADA deben permanecer iguales.
9. Ejecutar `docs/VALIDACION_MP_ETAPA8A.sql`. Revisar compra vinculada, acceso, duración congelada e historial. Los cuatro controles finales deben devolver cero.

Validación realizada aquí: suites completas del backend con Node 18.16 y frontend; HTTP real sobre SQLite aislado y archivos temporales; navegador Chromium con HTTPS, cookies reales, login y ambos CSRF, ida al campus y vista móvil. El proveedor/pago se simulan en pruebas; no se hicieron nuevos cobros. SQLite no verifica bloqueos ni concurrencia de MySQL. La prueba final indicada arriba debe hacerse en MySQL DESA.

Pendiente para completar el objetivo de autopago: registro público con verificación de email, asociación de la ficha CRM para clientes nuevos y módulo administrativo de compras/revisión. Todavía no es una preparación para producción.

Referencia de seguridad: https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
