-- Benjamin Orellana - 19/10/2026 - Solo SELECT; no hashes, tokens ni datos de tarjetas.
USE DB_FactoreDesa_04102026;

-- Compras y cuenta destinataria. Las pagadas sin usuario son válidas hasta confirmar la entrega.
SELECT c.referencia, c.estado, c.comprador_email, c.total, c.moneda,
       c.usuario_id, u.nombre AS alumno, u.email AS email_cuenta,
       c.pagada_en AS pago_utc,
       (SELECT COUNT(*) FROM auditoria_eventos e
        WHERE e.entidad='compras' AND e.entidad_id=c.id AND e.accion='COMPRA_ENTREGADA') AS entregas
FROM compras c LEFT JOIN usuarios u ON u.id=c.usuario_id
ORDER BY c.id DESC;

-- Fechas actuales y duración pactada en cada compra. Varias compras pueden renovar el mismo acceso.
SELECT c.referencia, u.nombre AS alumno, i.curso_id, i.titulo,
       i.acceso_duracion_cantidad, i.acceso_duracion_unidad,
       a.id AS acceso_id, a.alcance, a.estado, a.inicio_en, a.vence_en
FROM compras c
JOIN usuarios u ON u.id=c.usuario_id
JOIN compra_items i ON i.compra_id=c.id
LEFT JOIN curso_accesos a ON a.usuario_id=c.usuario_id AND a.curso_id=i.curso_id
ORDER BY c.id DESC, i.curso_id;

-- Recibo original: no cambia al repetir ni por ajustes posteriores de Juan.
SELECT e.id, c.referencia, u.nombre AS confirmado_por, e.creado_en AS entrega_utc, e.detalle
FROM auditoria_eventos e
JOIN compras c ON e.entidad='compras' AND e.entidad_id=c.id
LEFT JOIN usuarios u ON u.id=e.usuario_id
WHERE e.accion='COMPRA_ENTREGADA'
ORDER BY e.id DESC;

-- Historial de accesos generado por compras.
SELECT h.id, h.acceso_id, h.accion, u.nombre AS realizado_por, h.motivo, h.creado_en
FROM curso_accesos_historial h
LEFT JOIN usuarios u ON u.id=h.realizado_por
WHERE h.motivo LIKE 'Compra online %'
ORDER BY h.id DESC;

-- Cuatro resultados esperados en cero.
SELECT
  (SELECT COUNT(*) FROM compras c WHERE c.usuario_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM auditoria_eventos e WHERE e.entidad='compras'
       AND e.entidad_id=c.id AND e.usuario_id=c.usuario_id AND e.accion='COMPRA_ENTREGADA')) AS vinculadas_sin_comprobante,
  (SELECT COUNT(*) FROM (SELECT entidad_id FROM auditoria_eventos
     WHERE entidad='compras' AND accion='COMPRA_ENTREGADA'
     GROUP BY entidad_id HAVING COUNT(*)>1) d) AS entregas_duplicadas,
  (SELECT COUNT(*) FROM compras c JOIN usuarios u ON u.id=c.usuario_id
     WHERE u.rol<>'ALUMNO') AS compras_vinculadas_a_admin,
  (SELECT COUNT(*) FROM compras c JOIN compra_items i ON i.compra_id=c.id
     LEFT JOIN curso_accesos a ON a.usuario_id=c.usuario_id AND a.curso_id=i.curso_id
     WHERE c.usuario_id IS NOT NULL AND a.id IS NULL) AS compras_sin_acceso;
