# Alta de comprador nuevo con buzón local

Benjamin Orellana — 19/10/2026.

Esta etapa permite probar registro y activación sin Gmail ni correo definitivo de Factor E.
Mailpit recibe los mensajes en la propia computadora. No se configura reenvío ni relay.
El envío real y la titularidad de un buzón externo siguen pendientes de la integración del correo.

## Archivos y configuración

Un servicio permite explícitamente SMTP en 127.0.0.1:1587 solo con
CORREO_PRUEBA_LOCAL=true, NODE_ENV=development/test y MP_MODO=PRUEBA. El modo local
no funciona en producción. Sigue exigiendo STARTTLS, autenticación y certificado válido.
Los puertos 465 y 587 del correo real conservan su configuración anterior.

`Scripts/correo-prueba.sh` descarga Mailpit v1.31.6 para Linux amd64/arm64 desde su
release oficial y verifica el SHA256 publicado. Requiere curl, tar, openssl y sha256sum.
No requiere sudo, Docker ni paquetes npm nuevos. Guarda el programa, un certificado local
de 30 días, una credencial aleatoria y los mensajes fuera del proyecto, en
`~/.local/share/factore-correo-prueba`, con permisos privados. No subir esa carpeta al repo.

Mailpit solo escucha en 127.0.0.1:8025 (buzón) y 127.0.0.1:1587 (SMTP con STARTTLS).
Arranca con entorno limpio para que variables heredadas no activen reenvíos o notificaciones.
El certificado se confía únicamente en los procesos Node de esta prueba mediante
NODE_EXTRA_CA_CERTS. No se instala en el navegador ni en el sistema operativo.

El script no modifica .env, MySQL ni el frontend. Los secretos de Mercado Pago permanecen
en el .env existente. La configuración temporal de correo se aplica solo al backend iniciado
con el script. Conservar CORREO_HABILITADO=false en el .env mientras se pospone el correo real.

## Preparar

Aplicar el ZIP con respaldo y ejecutar:

```bash
node --test Tests/correo-local.test.js Tests/registro-compra.test.js Tests/usuarios-auth.test.js
```

En una terminal nueva, iniciar el buzón y dejarla abierta:

```bash
cd ~/Node_Factore_V1
bash Scripts/correo-prueba.sh iniciar
```

Abrir http://127.0.0.1:8025. La primera ejecución descarga el programa y prepara el certificado.
El buzón no debe agregarse al túnel ni a la URL pública de Factor E.

En la terminal del backend, detener nodemon con Ctrl+C e iniciar:

```bash
cd ~/Node_Factore_V1
bash Scripts/correo-prueba.sh backend
```

Mantener Vite y Cloudflare abiertos. No volver a ejecutar nodemon por separado mientras
el backend iniciado con este comando siga usando el puerto 3001.

En otra terminal, comprobar SMTP antes de hacer la compra:

```bash
cd ~/Node_Factore_V1
bash Scripts/correo-prueba.sh comprobar
```

Debe imprimir SMTP_LOCAL_OK. En el buzón aparecerá un mensaje para prueba-local@example.com;
es solo la prueba de transporte, no crea una cuenta ni abre MySQL. Si la comprobación falla,
revisar que el buzón esté abierto antes de avanzar. Al regenerarse un certificado vencido,
reiniciar tanto el buzón como el backend para usar el mismo certificado.

## Probar el comprador nuevo

1. En Gestión → Usuarios, comprobar que no exista `nuevo.factore.20261019@example.com`.
   Si ya se usó, elegir otro email nuevo y conservarlo durante todo el recorrido.
2. En la ventana de compra, usar la dirección HTTPS vigente del túnel. No alternar con
   localhost ni cerrar la ventana incógnita, para conservar la cookie privada de la compra.
3. Comprar Motor de Resultados con nombre Alumno Nuevo Factor E y el email nuevo elegido.
   Completar el pago en sandbox con el comprador y tarjeta de prueba que ya funcionaron.
4. Volver al resultado de Factor E y esperar su confirmación del pago. Pulsar Crear mi cuenta.
   El mensaje recibido en pantalla es genérico; no contiene la contraseña ni el token.
5. En otra pestaña de esa MISMA ventana de compra, abrir http://127.0.0.1:8025 y buscar el
   correo de activación para el email elegido. Abrir su enlace desde esa misma ventana.
   No copiar el enlace al chat: contiene una credencial de activación de un solo uso.
6. Elegir contraseña y repetirla, entre 15 y 128 caracteres. Al activar, iniciar sesión con
   el email nuevo y esa contraseña. Debe volver a la asignación de la compra original.
7. Confirmar asignación y abrir Mis cursos. Motor de Resultados debe aparecer con acceso
   por la duración comprada y progreso inicial cero, porque esta cuenta nunca tuvo avance.
8. Desde administración, Compras debe mostrar Pagada / Entregada con la cuenta y ficha nuevas.

Si el email corresponde a una cuenta existente, el sistema conserva su contraseña y sus
sesiones: envía un recordatorio de ingreso en lugar de activar o apropiarse de esa cuenta.
No crear previamente el alumno desde Gestión durante esta prueba, porque queremos comprobar
que lo crea el flujo de compra.

## Validar sin exponer credenciales

```sql
USE DB_FactoreDesa_04102026;
SET SESSION time_zone = '+00:00';

SELECT u.id, u.nombre, u.email, u.rol, u.estado,
       c.id AS cliente_id, c.nombre AS cliente, c.activo AS ficha_activa
FROM usuarios u
LEFT JOIN crm_clientes c ON c.id = u.cliente_id
WHERE u.email = 'nuevo.factore.20261019@example.com';

SELECT c.referencia, c.estado AS estado_compra, u.email AS cuenta,
       cu.titulo, a.estado AS estado_acceso, a.inicio_en, a.vence_en,
       (SELECT COUNT(*) FROM auditoria_eventos e
        WHERE e.entidad='compras' AND e.entidad_id=c.id
          AND e.accion='COMPRA_ENTREGADA') AS entregas
FROM compras c
LEFT JOIN usuarios u ON u.id=c.usuario_id
JOIN compra_items i ON i.compra_id=c.id
JOIN cursos cu ON cu.id=i.curso_id
LEFT JOIN curso_accesos a ON a.usuario_id=c.usuario_id AND a.curso_id=i.curso_id
WHERE c.comprador_email='nuevo.factore.20261019@example.com'
ORDER BY c.id DESC;
```

Esperado al finalizar: cuenta ALUMNO/ACTIVO, ficha activa, compra PAGADA, acceso ACTIVO
y exactamente una entrega. Si se eligió otro email, reemplazarlo en los SELECT.

## Volver al modo anterior

Detener el backend iniciado por el script y el buzón con Ctrl+C. Volver a iniciar el backend
con `nodemon server.js`; recuperará CORREO_HABILITADO=false del .env original. No es necesario
borrar las cuentas o compras de prueba. Conservar sus registros para comprobar la entrega.

## Validación realizada

Node 18: configuración local restringida y regresiones de registro/autenticación. Navegador:
correo recibido por Mailpit real mediante STARTTLS, activación, elección de contraseña, login,
asignación y campus. Para la validación local se usó SQL aislado y pago simulado; la prueba
manual del usuario usa MySQL DESA y Mercado Pago sandbox. No se enviaron correos a Internet.

Fuentes oficiales de Mailpit:

- https://mailpit.axllent.org/docs/configuration/smtp/
- https://mailpit.axllent.org/docs/configuration/runtime-options/
- https://mailpit.axllent.org/docs/configuration/passwords/
- https://github.com/axllent/mailpit/releases/tag/v1.31.6
