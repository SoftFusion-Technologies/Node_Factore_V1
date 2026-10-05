# Factor E — Etapa 2A: controladores de clientes y comercios

Entrega incremental sobre la etapa 1 validada. Agrega cuatro controladores
`CTS_TB_*`, servicios de estado/auditoría y utilidades compartidas.
No reemplaza modelos, package.json, conexión o `.env`. No ejecuta migraciones.

## Verificación

```bash
cd ~/Node_Factore_V1
node Scripts/verificar-controladores-crm.js
node --test Tests/controladores-crm.test.js
npm run modelos:verificar
```

La carga local comprueba 4 controladores y 20 funciones sobre los 18 modelos.
Las pruebas requieren Python 3. Ejecutan SQL generado por Sequelize con un
adaptador SQLite aislado en memoria; no se conectan a MySQL ni insertan datos
en DESA. No sustituyen probar endpoints y bloqueos concurrentes contra MySQL.
El fixture `Tests/fixtures/crm.sqlite.sql` es exclusivo de esas pruebas.

## Autenticación y respuesta

Todas las funciones son administrativas. El middleware de autenticación de la
etapa de rutas deberá establecer `req.user = { id }` desde una sesión válida.
Ese ID nunca se tomará de un header libre, query ni cuerpo del alumno.
Los controladores vuelven a consultar la cuenta y exigen `ADMIN` y `ACTIVO`.
Este chequeo no reemplaza la verificación de sesión, cookies y CSRF que se
integrará al montar las rutas. Todavía no hay servidor HTTP ni endpoints activos.

Respuesta común: `{ data, message? }`. Los listados agregan `meta` con el total.
Errores: `{ error: { code, message } }` con estados 401, 403, 404, 409 o 422.
Los fallos inesperados devuelven 500 sin SQL ni detalles internos.
Los IDs se devuelven como texto y las fechas UTC como ISO con `Z`.

## Clientes — CTS_TB_Clientes.js

| Función | Entrada |
| --- | --- |
| OBRS_Clientes_CTS | query: q, tipo, estado_comercial, activo y paginación/orden |
| OBRS_DetCliente_CTS | params.id |
| CR_Cliente_CTS | body.nombre obligatorio; demás campos permitidos opcionales |
| UR_Cliente_CTS | params.id; body parcial |
| ER_Cliente_CTS | params.id; cuerpo vacío; desactiva |

Campos editables: `tipo`, `nombre`, `razon_social`, `documento`, `email`,
`telefono`, `rubro`, `ciudad`, `estado_comercial`, `activo`.
Una ficha puede existir sin cuenta; crear cliente no crea usuario.
El detalle/listado muestra la cuenta vinculada con datos seleccionados o null.
Para limpiar un campo opcional se admite null o texto vacío.

Tipos: PERSONA/EMPRESA. Estados: PROSPECTO/CLIENTE/INACTIVO.
Desactivar marca activo=0 y estado_comercial=INACTIVO, y revoca sesiones/tokens
del ALUMNO vinculado dentro de la misma transacción. Conserva la ficha, notas,
asignaciones y progreso. Reactivar con activo=1 o con estado comercial
PROSPECTO/CLIENTE conserva las revocaciones anteriores; no revive sesiones.
Combinaciones explícitas contradictorias de activo/estado se rechazan.

## Notas privadas — CTS_TB_ClientesNotas.js

| Función | Entrada |
| --- | --- |
| OBRS_ClientesNotas_CTS | params.cliente_id; query de búsqueda/paginación/orden |
| OBRS_DetClienteNota_CTS | params.cliente_id y params.id |
| CR_ClienteNota_CTS | params.cliente_id; body.contenido |
| UR_ClienteNota_CTS | params.cliente_id y params.id; body.contenido |
| ER_ClienteNota_CTS | params.cliente_id y params.id; cuerpo vacío |

El autor se toma de la cuenta autenticada, no de body.creado_por. La edición
conserva al autor original. Cada operación valida que la nota pertenezca al
cliente indicado. Borrar elimina esa nota y conserva el evento de auditoría.
No se permite contenido vacío; máximo 50.000 caracteres y 60.000 bytes UTF-8.
El contenido privado no se duplica en la auditoría.

## Comercios — CTS_TB_ComerciosAmigos.js

| Función | Entrada |
| --- | --- |
| OBRS_ComerciosAmigos_CTS | query: q, activo, mostrar_a_usuarios, rubro, ciudad y paginación/orden |
| OBRS_DetComercioAmigo_CTS | params.id |
| CR_ComercioAmigo_CTS | body.nombre obligatorio; demás campos editables opcionales |
| UR_ComercioAmigo_CTS | params.id; body parcial |
| ER_ComercioAmigo_CTS | params.id; cuerpo vacío; desactiva |

Campos editables: `nombre`, `slug`, `rubro`, `descripcion`, `ciudad`,
`direccion_publica`, `telefono_publico`, `email_publico`, `web_url`,
`instagram_url`, `observaciones_internas`, `mostrar_a_usuarios`, `activo`, `orden`.
Si se omite slug en el alta, se genera desde nombre. Debe ser único; un conflicto
devuelve 409 para elegir otro slug. Cambiar nombre no cambia automáticamente slug.
Las URLs admiten solamente http/https y sin credenciales.

Los flags del cuerpo admiten true/false o 1/0; no admiten strings booleanos.
Desactivar conserva vínculos y el flag de visibilidad. La vista de comercios del
campus solo muestra filas con activo=1 y mostrar_a_usuarios=1.
Estos controladores son privados de administración y pueden mostrar observaciones
internas; el futuro controlador de campus consultará la vista segura.

`logo_archivo_id` no es editable en este bloque. Si ya hay logo, se devuelve
su identificación seleccionada, sin rutas privadas. La carga, reemplazo y
eliminación física se incorporarán junto al módulo Archivo.

## Vínculos — CTS_TB_ComercioClientes.js

| Función | Entrada |
| --- | --- |
| OBRS_ClientesComercio_CTS | params.comercio_id; query de búsqueda/paginación/orden |
| OBRS_ComerciosCliente_CTS | params.cliente_id; query de búsqueda/paginación/orden |
| CR_ComercioCliente_CTS | params.comercio_id; body.cliente_id y funcion opcional |
| UR_ComercioCliente_CTS | params.comercio_id y params.id del vínculo; body.funcion |
| ER_ComercioCliente_CTS | params.comercio_id y params.id del vínculo; cuerpo vacío |

El cliente puede no tener cuenta ni cursos. Crear vínculo exige cliente y comercio
activos. Un par comercio/cliente duplicado devuelve 409. Editar solo cambia la
función; para cambiar el cliente se desvincula y crea un nuevo vínculo.
Desvincular elimina únicamente el vínculo y conserva las dos fichas.
Se valida la pertenencia del vínculo al comercio indicado.

## Listados y auditoría

Sin pagina/por_pagina se devuelven TODOS los resultados, sin recorte de 100.
La paginación se habilita únicamente al enviar uno de esos parámetros:
por defecto 20 por página, admitiendo 1 a 500. El total corresponde a los filtros.
Filtros booleanos de query admiten 0/1/true/false como strings.
Se rechazan campos, filtros, páginas y órdenes inválidos.

`ordenar_por` usa columnas permitidas por controlador; `direccion` admite
ASC/DESC. Clientes: id/nombre/creado_en/actualizado_en; comercios agrega orden.
Notas: id/creado_en/actualizado_en. Vínculos: id/creado_en.
La búsqueda q admite patrones LIKE (% y _) y se escapa mediante Sequelize;
no se interpola SQL construido por el usuario.

Toda modificación se confirma junto a su auditoría en una transacción.
Si falla el registro del evento se revierte la operación. La auditoría guarda
IDs y nombres de campos modificados, no contraseñas, tokens ni texto privado.
