-- Benjamin Orellana - 19/10/2026 - Solo SELECT; no tokens, hashes ni secretos SMTP.
USE DB_FactoreDesa_04102026;

-- Identificar el email de cada compra y su cuenta; no usar la cuenta de Mercado Pago como login del campus.
SELECT c.referencia, c.comprador_email, c.estado AS estado_compra,
       u.id AS usuario_id, u.nombre, u.rol, u.estado AS estado_cuenta,
       u.cliente_id, c.usuario_id AS cuenta_con_entrega_confirmada
FROM compras c
LEFT JOIN usuarios u ON u.email=c.comprador_email
ORDER BY c.id DESC;

-- Eventos del registro y correo. ACEPTADO significa aceptación SMTP, no entrega en bandeja.
SELECT a.id, c.referencia, a.accion, a.creado_en AS fecha_utc, a.detalle
FROM auditoria_eventos a
JOIN compras c ON a.entidad='compras' AND a.entidad_id=c.id
WHERE a.accion IN ('COMPRA_CUENTA_CREADA','COMPRA_CORREO_SOLICITADO','COMPRA_CORREO_ACEPTADO','COMPRA_ENTREGADA')
ORDER BY a.id DESC;

-- Activaciones: no mostrar el token_hash. Usado/revocado impide reutilizar un enlace.
SELECT t.id, t.usuario_id, u.email, t.tipo, t.creado_en, t.vence_en, t.usado_en, t.revocado_en
FROM usuarios_tokens t JOIN usuarios u ON u.id=t.usuario_id
WHERE t.tipo='ACTIVACION'
ORDER BY t.id DESC;

-- Esperado cero: una cuenta pendiente no recibe una entrega por este flujo.
SELECT COUNT(*) AS entregas_a_cuentas_pendientes
FROM compras c JOIN usuarios u ON u.id=c.usuario_id
WHERE u.estado='PENDIENTE';

-- Los controles de duración, progreso e idempotencia siguen en VALIDACION_MP_ETAPA8A.sql.
