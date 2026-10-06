# Factor E · Logos de comercios amigos

Benjamin Orellana · 05/10/2026.

Parche incremental del backend instalado. Agrega una operación para gestionar el logo del comercio desde el frontend. No cambia las tablas, modelos, dependencias, autenticación ni archivos .env.

## Ruta

`PATCH /api/admin/comercios/:id/logo`

Requiere sesión ADMIN activa, contraseña actualizada, origen permitido y CSRF. Cuerpo exacto:

```json
{"logo_archivo_id":"123"}
```

Para retirar el logo:

```json
{"logo_archivo_id":null}
```

El archivo se carga antes mediante la ruta existente `POST /api/admin/archivos/subir/IMAGEN`. La operación de logo exige una imagen DISPONIBLE y físicamente accesible. IDs BIGINT se mantienen como cadenas exactas. El PATCH general del comercio sigue rechazando logo_archivo_id; se usa exclusivamente esta nueva ruta.

## Referencias y borrado

La asociación y el evento COMERCIO_LOGO_ACTUALIZADO se guardan en una transacción. Si falla la auditoría, se revierte el cambio y no se elimina el logo anterior.

Reemplazar o retirar un logo elimina el archivo anterior únicamente cuando no tiene referencias desde comercios, cursos, lecciones o materiales. Una referencia compartida conserva el archivo. El borrado se procesa después de confirmar la transacción y registra su comprobante en archivos_eliminaciones. Si falla, responde 202 con trabajos pendientes o en error; el frontend informa esa situación. Se puede reintentar con el script de eliminaciones existente.

Desactivar un comercio conserva su logo y vínculos. La visibilidad del campus requiere activo=1 y mostrar_a_usuarios=1. Sus endpoints existentes comprueban nuevamente esa condición y no exponen observaciones internas ni clientes vinculados.

## Instalación y verificaciones

Respaldar src, Scripts, Tests y docs. Extraer el ZIP en HOME y ejecutar desde Node_Factore_V1:

```bash
node Scripts/verificar-controladores-crm.js
npm run rutas:verificar
npm test
npm run modelos:verificar
```

El contrato suma una ruta: 95 rutas totales, 88 funciones y 21 funciones CRM. La prueba HTTP cubre también la asociación real del logo y las 90 rutas protegidas. Se agregaron ocho casos de archivos, referencias, permisos, reversión y reintento en Tests/comercios-logos.test.js. Las 16 suites del backend pasaron con SQLite aislado y archivos temporales; no se abrió MySQL DESA.

Reiniciar o mantener el backend con nodemon server.js antes de instalar/probar el frontend etapa 8. No se hizo build ni deploy.
