# Mi agenda y Google Calendar · Etapa 1

La conexión es opcional e individual. Una persona con acceso activo a Mi agenda
puede conectar su cuenta de Google y ver los eventos de su calendario principal
del día seleccionado, en hora argentina. Se muestran título, horario y enlace
de Google Calendar o de Google Meet cuando están disponibles. Las tareas,
notas y cronómetros de Factor E siguen funcionando de forma independiente.
Factor E no copia los eventos a MySQL ni pide permiso para editar el calendario.

## Instalación en DESA

Después de respaldar ambos proyectos y la base, extraer el ZIP en la carpeta
personal. Aplicar `docs/sql/AGENDA_GOOGLE_ETAPA1.sql` en
`DB_FactoreDesa_04102026` antes de levantar el backend. La migración es aditiva
y puede volver a ejecutarse. La integración queda apagada sin
`GOOGLE_AGENDA_HABILITADO=true`. No requiere instalar dependencias nuevas.

## Google Cloud

1. En un proyecto de Google Cloud de Factor E, habilitar **Google Calendar API**.
2. En **Google Auth Platform**, configurar la marca y la audiencia **External**
   en modo de prueba. Añadir los correos Google de las personas que harán la
   prueba como usuarios de prueba. Configurar en Data Access el permiso
   `https://www.googleapis.com/auth/calendar.events.owned.readonly`.
3. Crear un cliente OAuth de tipo **Aplicación web**. En **URI de redireccionamiento
   autorizados**, agregar exactamente
   `http://127.0.0.1:5173/api/agenda/google/callback`.
4. Añadir al `.env` del backend y completar con los datos del proyecto:

   ```dotenv
   GOOGLE_AGENDA_HABILITADO=true
   GOOGLE_AGENDA_ORIGEN=http://127.0.0.1:5173
   GOOGLE_AGENDA_CLIENT_ID=
   GOOGLE_AGENDA_CLIENT_SECRET=
   GOOGLE_AGENDA_CLAVE_CIFRADO=
   ```

   Generar la clave con `openssl rand -hex 32` y guardarla de forma privada.
   Conservarla entre reinicios: si se pierde, las conexiones existentes deben
   volver a autorizarse. Mantener `http://127.0.0.1:5173` dentro de
   `ALLOWED_ORIGINS`. La cookie de sesión debe permitir el retorno de Google
   (por ejemplo, SameSite=Lax). Para esta prueba no hay que cambiar el túnel,
   las URLs ni las credenciales de Mercado Pago.

## Prueba

1. Reiniciar el backend y levantar Vite. Abrir
   `http://127.0.0.1:5173` e iniciar sesión en una cuenta con Mi agenda activa.
   Usar **127.0.0.1** en toda la prueba; no alternar con localhost o el túnel.
2. En **Mi agenda → Google Calendar**, pulsar **Conectar Google Calendar**.
   Autorizar con una cuenta Google incluida en la audiencia de prueba.
3. Elegir un día con eventos en su calendario principal. Verificar horario,
   eventos de día completo y el botón para unirse a Meet si corresponde.
4. Crear o mover un evento en Google y pulsar **Actualizar** en Mi agenda.
   Verificar que se ve el cambio. Probar **Desconectar**: se retira el
   acceso de Factor E y sus tareas siguen ahí. También se puede retirar la
   autorización desde la sección de conexiones de la cuenta Google.

Antes de abrir la integración al público, definir el dominio definitivo y
completar la configuración y la verificación OAuth que correspondan.

## API

Sesión autenticada y acceso vigente a Mi agenda para consultar y conectar.
El callback verifica la sesión, el intento y el acceso. Se puede desconectar
la propia cuenta incluso si venció el acceso a Mi agenda.

| Método | Ruta | Uso |
|---|---|---|
| GET | /api/agenda/google/dias/:fecha | Estado de conexión y eventos del día |
| POST | /api/agenda/google/conectar | Iniciar autorización (origen y CSRF) |
| GET | /api/agenda/google/callback | Confirmar autorización |
| DELETE | /api/agenda/google | Desconectar (origen y CSRF) |

La etapa 2 puede añadir **Crear evento en Google**, con consentimiento de
escritura al usar la opción y un formulario explícito de título, fecha y
horario. Crear tareas en Mi agenda seguirá siendo una operación independiente.
