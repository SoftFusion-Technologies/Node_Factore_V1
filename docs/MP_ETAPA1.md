# Mercado Pago: etapa 1, configuración del curso

Se agregan tres campos: venta_online_habilitada (0), acceso_duracion_cantidad
(1) y acceso_duracion_unidad (MESES). El valor inicial es UN MES CALENDARIO,
no treinta días; el cálculo de las fechas se realizará al implementar compras.
Se permite elegir días (1–3650) o meses (1–120). Son 188 campos y 17 CHECK.

La creación y edición administrativas permiten configurar la duración. Para
preparar venta online se exige curso publicado, visible, precio positivo en
ARS y al habilitarla se verifica un video publicado físicamente disponible.
Ocultar, archivar o volver a borrador desactiva esa opción automáticamente.
Esto no altera las fechas ni el progreso de accesos ya asignados.

Todavía no hay checkout ni cobros; el botón del carrito mantiene su coordinación
actual. Kit sigue en borrador hasta que se cargue y publique su contenido en
el campus. La duración elegida no activa un plazo por sí sola.

El próximo paso registra compras y sus precios/duraciones al momento de pagar.
Luego se integra Checkout Pro, confirmación del pago, registro y asignación.
Inicio propuesto para cuentas nuevas: al completar la cuenta; para cuentas
existentes: al aprobarse el pago. Esta regla se concretará en esa etapa.

Instalación: respaldo de código y MySQL; con ambos servidores detenidos,
extraer ZIP, ejecutar docs/MP_ETAPA1_CURSO.sql y verificar modelos:db y pruebas.
La migración usa DDL: un error no revierte columnas ya agregadas. Es idempotente
para continuar tras resolver errores; no borra ni recrea cursos.
