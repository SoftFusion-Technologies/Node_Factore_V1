-- Factor E | Revisión de compras pendientes | Solo SELECT.
USE DB_FactoreDesa_04102026;
-- Sin filas es correcto antes de comenzar pruebas con Mercado Pago.
SELECT id,referencia,estado,total,moneda,vence_en,
       mp_preferencia_estado,mp_preferencia_id,mp_error_codigo
FROM compras
WHERE mp_preferencia_estado IN ('CREANDO','INCIERTA','ERROR')
ORDER BY creado_en,id;

SELECT c.id,c.referencia,c.estado,c.total,c.moneda,
       COUNT(p.id) AS pagos_registrados,
       SUM(CASE WHEN p.validacion='REVISION' THEN 1 ELSE 0 END) AS pagos_en_revision
FROM compras c LEFT JOIN compra_pagos p ON p.compra_id=c.id
GROUP BY c.id,c.referencia,c.estado,c.total,c.moneda
ORDER BY c.id;

SELECT id,accion,entidad_id,creado_en
FROM auditoria_eventos
WHERE entidad='compras' AND accion IN ('MP_PREFERENCIA_RECUPERADA','COMPRA_PAGADA','MP_PAGO_REVISION')
ORDER BY id;

-- Debe devolver 0 filas: una confirmación histórica por compra.
SELECT entidad_id,COUNT(*) AS confirmaciones
FROM auditoria_eventos
WHERE entidad='compras' AND accion='COMPRA_PAGADA'
GROUP BY entidad_id HAVING COUNT(*)>1;
