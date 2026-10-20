-- Factor E | Validación etapa 4 | Solo SELECT
USE DB_FactoreDesa_04102026;
SELECT TABLE_TYPE, COUNT(*) AS cantidad
FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() GROUP BY TABLE_TYPE;
-- Esperado: 21 tablas y 4 vistas. Antes de pruebas: cero pagos es correcto.
SELECT COUNT(*) AS pagos_registrados FROM compra_pagos;
SELECT c.id,c.referencia,c.comprador_nombre,c.estado,c.total,c.moneda,c.pagada_en,
       p.mp_pago_id,p.estado AS estado_mp,p.validacion,p.motivo_revision,
       p.importe,p.importe_reintegrado,p.aprobado_en,p.verificado_en
FROM compras c LEFT JOIN compra_pagos p ON p.compra_id=c.id
ORDER BY c.id,p.id;
-- Historial de pagos: no muestra hash de compra ni datos de tarjeta.
-- Ambos deben ser 0.
SELECT
 (SELECT COUNT(*) FROM (SELECT mp_pago_id FROM compra_pagos GROUP BY mp_pago_id HAVING COUNT(*)>1) d) AS pagos_duplicados,
 (SELECT COUNT(*) FROM compras c WHERE c.estado='PENDIENTE' AND EXISTS (
   SELECT 1 FROM compra_pagos p WHERE p.compra_id=c.id AND p.estado='approved' AND p.validacion='VALIDADO'
 )) AS aprobados_sin_confirmar;
-- REVISION puede contener cobros: requieren resolver, no borrar ni repetir el pago a ciegas.
SELECT compra_id,mp_pago_id,estado,importe,importe_reintegrado,motivo_revision,verificado_en
FROM compra_pagos WHERE validacion='REVISION' ORDER BY verificado_en,id;
