# Compras en administración — primera parte

Benjamin Orellana — 19/10/2026.

Dos consultas privadas para preparar la pantalla de Compras de Juan. No cambian
el esquema, las credenciales ni el flujo de pago, registro o asignación. Todavía
no agregan un menú al frontend. No requieren correo configurado.

## Rutas

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/admin/compras` | Listado con comprador, importe, cursos, pago en revisión y estado de entrega |
| GET | `/api/admin/compras/:id` | Detalle por ID interno de compra, pagos, cuenta, ficha y accesos actuales |

Ambas exigen cookie de sesión válida, cuenta ADMIN activa y contraseña actualizada.
No aceptan un ID de usuario o una referencia pública como autenticación. No existe
una operación para marcar pagada, asignar, cancelar o devolver dinero desde estas rutas.
Las consultas no contactan Mercado Pago y solo ejecutan SELECT.

## Filtros del listado

| Parámetro | Valores |
| --- | --- |
| `q` | Nombre del comprador, email o referencia, hasta 180 caracteres |
| `estado_temporal` | PENDIENTE, VENCIDA, PAGADA, CANCELADA |
| `estado_entrega` | PENDIENTE, ENTREGADA, REVISION, NO_CORRESPONDE |
| `pago_en_revision` | 0 o 1 |
| `curso_id`, `usuario_id` | IDs positivos exactos; usuario_id filtra la cuenta ya vinculada |
| `creado_desde`, `creado_hasta` | ISO UTC terminado en Z; inicio incluido y final excluido |
| `pagina`, `por_pagina` | Paginación explícita; hasta 500 por página |
| `ordenar_por` | id, creado_en, actualizado_en, total, comprador_nombre |
| `direccion` | ASC o DESC |

Por defecto ordena por creación descendente e ID como desempate. Sin paginación
devuelve el listado completo, sin recortar a 100. `meta` sigue el contrato existente.
Los filtros se aplican antes de paginar. Una compra de varios cursos aparece una sola vez.
Precios y BIGINT se conservan como texto exacto. El detalle no admite query parameters.

## Pago y entrega son datos diferentes

`estado_temporal` calcula el vencimiento del intento de pago pendiente, sin cron.
Una compra pagada sigue PAGADA aunque haya pasado la fecha de su enlace de pago.
Esto no es el vencimiento del acceso al curso.

`estado_entrega` significa:

- ENTREGADA: compra pagada, cuenta vinculada y exactamente un comprobante
  COMPRA_ENTREGADA de esa cuenta en la auditoría.
- PENDIENTE: compra pagada sin cuenta vinculada ni comprobante de entrega.
- REVISION: vínculo o comprobantes inconsistentes, duplicados o de otra cuenta.
- NO_CORRESPONDE: compra no pagada y sin entrega.

`pago_en_revision` señala registros de compra_pagos con validacion=REVISION;
es independiente de la entrega. Una entrega previa no desaparece al reintegrar
un pago o revocar posteriormente el acceso desde administración.

El detalle conserva `usuario` como destino efectivamente vinculado. `cuenta_por_email`
solo informa una cuenta coincidente para revisión: no la crea, no la vincula y no
prueba que recibió esta compra. `cliente` es la ficha de esa cuenta. Si no hay cuenta,
ambos son null. Las fichas sin cuenta no se vinculan por coincidencias de email.

Los items muestran título, precio y duración pactados en la compra, junto al estado
actual del curso y su acceso. Un acceso revocado, suspendido, por selección o con
excepciones tiene `requiere_revision_para_asignar=true`. Un acceso vencido que sigue
ACTIVO y COMPLETO sin excepciones puede renovarse con la compra. El permiso efectivo
también depende de la cuenta y del contenido; estos campos no otorgan acceso.

El historial de eventos no devuelve el JSON interno de auditoría. No se envían hashes,
tokens, cookies, contraseñas, enlaces de checkout, rutas de disco ni datos de tarjetas.

## Instalación y verificación

Aplicar el ZIP con respaldo de src, Scripts, Tests y docs. No requiere npm ci ni SQL.

```bash
node --test Tests/compras-admin.test.js Tests/rutas-http.test.js
npm run rutas:verificar
```

Reiniciar el backend para cargar las rutas. Desde la consola del navegador donde
se inició sesión como ADMIN en Factor E, consultar:

```js
// Benjamin Orellana - 19/10/2026 - Verificar compras con la sesión administrativa existente.
(async () => {
  const res = await fetch('/api/admin/compras?pagina=1&por_pagina=25', {
    credentials: 'include', headers: { Accept: 'application/json' }
  });
  const respuesta = await res.json();
  if (!res.ok) { console.log(res.status, respuesta.error?.code); return; }
  console.table(respuesta.data.map(c => ({
    id: c.id, comprador: c.comprador_nombre, email: c.comprador_email,
    total: c.total, pago: c.estado_temporal, entrega: c.estado_entrega,
    revision_pago: c.pago_en_revision
  })));
})();
```

La compra ya validada de Benjamin debe figurar PAGADA y ENTREGADA. Consultar el detalle
con `/api/admin/compras/ID_INTERNO` usando el id obtenido del listado. La referencia UUID
sigue disponible para soporte y búsqueda, pero no sustituye el id interno de esta ruta.

Validación local: HTTP real y SQL Sequelize/MySQL ejecutado en SQLite aislado, con Node 18.
No valida bloqueos ni rendimiento de un MySQL Server real. El paso siguiente es conectar
la pantalla de listado/detalle en el frontend con estas consultas.
