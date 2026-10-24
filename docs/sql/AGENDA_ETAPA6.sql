-- Benjamin Orellana - 24/10/2026 - Compras de Agenda; conserva cursos, precios y permisos actuales.
USE DB_FactoreDesa_04102026;
CREATE TABLE IF NOT EXISTS agenda_compras (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  compra_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'ARS',
  acceso_duracion_cantidad INT UNSIGNED NULL,
  acceso_duracion_unidad ENUM('DIAS','MESES','SIN_VENCIMIENTO') NOT NULL,
  configuracion_version INT UNSIGNED NOT NULL,
  entregada_en DATETIME(3) NULL,
  acceso_id BIGINT UNSIGNED NULL,
  accion ENUM('ASIGNADO','RENOVADO','CONSERVADO') NULL,
  inicio_en DATETIME(3) NULL,
  vence_en DATETIME(3) NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_agenda_compras_compra (compra_id),
  KEY ix_agenda_compras_usuario (usuario_id),
  KEY ix_agenda_compras_acceso (acceso_id),
  CONSTRAINT fk_agenda_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_agenda_compra_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_agenda_compra_acceso FOREIGN KEY (acceso_id) REFERENCES agenda_accesos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_agenda_compra_precio CHECK (precio_unitario > 0),
  CONSTRAINT ck_agenda_compra_moneda CHECK (moneda = 'ARS'),
  CONSTRAINT ck_agenda_compra_version CHECK (configuracion_version >= 1),
  CONSTRAINT ck_agenda_compra_duracion CHECK (
    (acceso_duracion_unidad = 'SIN_VENCIMIENTO' AND acceso_duracion_cantidad IS NULL)
    OR (acceso_duracion_unidad = 'DIAS' AND acceso_duracion_cantidad IS NOT NULL AND acceso_duracion_cantidad BETWEEN 1 AND 3650)
    OR (acceso_duracion_unidad = 'MESES' AND acceso_duracion_cantidad IS NOT NULL AND acceso_duracion_cantidad BETWEEN 1 AND 120)
  ),
  CONSTRAINT ck_agenda_compra_entrega CHECK (
    (entregada_en IS NULL AND acceso_id IS NULL AND accion IS NULL AND inicio_en IS NULL AND vence_en IS NULL)
    OR (entregada_en IS NOT NULL AND acceso_id IS NOT NULL AND accion IS NOT NULL AND inicio_en IS NOT NULL
      AND (vence_en IS NULL OR vence_en > inicio_en))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SELECT COUNT(*) AS compras_agenda FROM agenda_compras;
