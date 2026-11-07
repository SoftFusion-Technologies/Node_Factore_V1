# Crear eventos desde Factor E · 07/11/2026

Esta etapa añade creación explícita en el calendario principal de la cuenta
Google vinculada. Requiere las dos entregas anteriores de lectura y calendario
mensual. No requiere SQL, nuevas dependencias ni nuevas variables de entorno.

## Configurar el permiso en Google Cloud

En el mismo proyecto Factor E DESA, abrir Google Auth Platform → Acceso a los
datos → Agregar o quitar permisos. Conservar el permiso de lectura y añadir:

    https://www.googleapis.com/auth/calendar.events.owned

Guardar. Mantener el estado En pruebas y los correos de las cuentas de prueba.
No hace falta crear otro cliente OAuth, cambiar el secreto, regenerar la clave
de cifrado ni cambiar la URL de retorno.

Google define este permiso para ver, crear, cambiar y eliminar eventos en
calendarios propios. El flujo implementado aquí utiliza lectura y creación.
El permiso se solicita al pulsar Habilitar creación de eventos; la conexión
que solo autorizó lectura continúa funcionando sin concederlo.

Referencia:
https://developers.google.com/workspace/calendar/api/auth

## Prueba en DESA

1. Respaldar src, Scripts, Tests y docs de ambos proyectos fuera de los repos.
   Extraer este ZIP sobre la carpeta personal con el backend detenido.
2. Ejecutar en Node_Factore_V1:

       npm run rutas:verificar
       node --test Tests/agenda-google.test.js Tests/agenda-google-eventos.test.js

   Ejecutar en sist-factore-front-desa:

       node --test Tests/agenda-google-eventos.test.js

3. Reiniciar backend y frontend. Abrir http://127.0.0.1:5173 con una cuenta
   que tenga Mi agenda activa. Mantener esta misma dirección durante la prueba.
4. En Google Calendar, dentro de Mi agenda, pulsar Habilitar creación de eventos.
   Autorizar con la cuenta Google de prueba que se desea usar.
5. Al volver a Factor E, pulsar Crear evento en Google. Ingresar un título,
   fecha y horario y pulsar Crear evento.
6. Comparar el evento en Factor E y en el calendario principal de Google.
   Los horarios ingresados se interpretan en Argentina (UTC−3), aunque el
   navegador utilice otra zona.
7. Probar Todo el día. El último día del formulario es inclusivo; Google recibe
   el fin exclusivo que exige su API. Probar un evento que cruza medianoche.
8. Verificar que el evento no se convirtió en tarea ni cambió el progreso.

## Recuperación de envíos

El mismo evento conserva una referencia y un ID remoto estable. Antes de
insertar se consulta si ese ID ya existe. Un doble clic no hace dos envíos
simultáneos en el mismo proceso, y los reintentos usan el mismo ID de Google.

El intento y el formulario se conservan en sessionStorage, por cuenta y
conexión, antes de enviar. Una respuesta perdida no se anuncia como éxito.
Comprobar envío consulta ese mismo evento; si todavía no hay confirmación,
Reintentar mismo envío reutiliza los datos y el ID. Recargar la pestaña y abrir
el formulario permite retomar el intento. Se limpia cuando se confirma o se
comprueba que fue eliminado.

Si se cambió de cuenta Google o se volvió a autorizar la conexión durante un
envío pendiente, el intento anterior no se envía a la nueva conexión. Revisar
primero el calendario de Google antes de iniciar otro evento.

La auditoría guarda el ID del evento, sin título ni horarios. Si falla después
de crear el evento en Google, la comprobación recupera la confirmación sin
insertarlo nuevamente. No se sobrescriben eventos editados directamente en
Google.

Referencias:
https://developers.google.com/workspace/calendar/api/guides/create-events
https://developers.google.com/workspace/calendar/api/v3/reference/events/insert

## API

Sesión, acceso vigente a Mi agenda, propiedad de la conexión y consentimiento
de escritura. POST exige además origen, CSRF y JSON.

| Método | Ruta | Función |
|---|---|---|
| POST | /api/agenda/google/conectar | Cuerpo vacío para lectura o escritura: true para solicitar el permiso adicional |
| POST | /api/agenda/google/eventos | Crear o recuperar el mismo evento |
| GET | /api/agenda/google/eventos/:referencia?conexion_revision=... | Comprobar el envío |

El formulario crea eventos simples, con horario o de día completo. No agrega
invitados, no genera un enlace de Meet y no solicita la edición de tareas de
Factor E. La edición o eliminación de eventos puede hacerse en Google Calendar.

Las pruebas automáticas y de navegador usan Google simulado y SQLite aislado.
La prueba contra la cuenta Google real se realiza en DESA después de instalar.
En la copia de QA faltan los dos videos comerciales del sitio público, por lo
que un build completo requiere reponer esos recursos originales; este ZIP no
los modifica.
