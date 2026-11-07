# Google Calendar dentro del calendario mensual · 07/11/2026

Requiere tener instalada la etapa 1 del 05/11/2026. No modifica la base de
datos, el .env, las credenciales, los permisos de Google ni la conexión actual.

## Resultado

Los eventos del calendario principal aparecen en las casillas de su fecha
argentina, en azul, con hora y título. Los eventos de día completo se rotulan
“Todo el día”. Si cruzan medianoche, se muestran en cada día afectado; el fin
es exclusivo, por lo que un evento que termina a las 00:00 no ocupa el día
siguiente. No se convierten en tareas ni cuentan para el progreso.

Se muestran hasta dos tareas y dos eventos por casilla, con el número adicional
cuando hay más. Pulsar un día abre el detalle completo debajo. En pantallas
pequeñas se puede desplazar horizontalmente el calendario, sin desbordar la
página. Continúan los temas claro y oscuro.

El mes se consulta por período, con paginación del proveedor, sin emitir una
consulta por cada día. Se actualiza al abrir la agenda, cambiar de mes, pulsar
Actualizar en el bloque Google y, con la agenda visible y conectada, al volver
a la pestaña o cada minuto. No es una suscripción en tiempo real. Cambiar solo
el día no vuelve a consultar todo el mes.

## Instalación y validación

Detener el backend antes de extraer el ZIP sobre la carpeta personal. Respaldar
los directorios src, Scripts, Tests y docs de ambos proyectos fuera de los repos.
No ejecutar migraciones: no hay SQL en este paquete.

En Node_Factore_V1:

    npm run modelos:verificar
    npm run rutas:verificar
    node --test Tests/agenda-google.test.js Tests/agenda-rutas-http.test.js

En sist-factore-front-desa:

    node --test Tests/agenda-google-calendario.test.js

Reiniciar backend y frontend. Mantener la dirección configurada
http://127.0.0.1:5173 durante las pruebas.

1. Verificar los eventos del viernes 6 y lunes 9 de noviembre en las casillas.
2. Pulsar ambos días y comparar título y horario con el detalle inferior.
3. Mover un evento en Google y usar Actualizar en Factor E.
4. Cambiar de mes y comprobar que los eventos se muestran solo en su período.
5. Probar día completo y un evento que cruza medianoche.
6. Desconectar Google: desaparecen sus eventos y las tareas propias siguen.
7. En móvil, deslizar el calendario y seleccionar un día.

Validación local: pruebas HTTP con sesiones y persistencia SQLite aislada;
Google simulado, sin usar las credenciales del usuario ni contactar su cuenta.
El build completo de la copia de QA requiere los dos videos comerciales
juan-factor-e-web.mp4 y juan-factor-e-web-horizontal.mp4, que no venían en
el archivo de fuentes recuperado. El ZIP no modifica esos recursos.

Crear eventos desde Factor E queda para la etapa 2, con consentimiento
adicional de escritura y un formulario específico.
