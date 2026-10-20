-- Factor E | Etapa 4: confirmación de pagos de PRUEBA | 13/10/2026
-- Ejecutar tras MP_ETAPA3_CHECKOUT.sql. No inserta compras ni cobra dinero.
USE DB_FactoreDesa_04102026;
SET NAMES utf8mb4;
SET SESSION lock_wait_timeout=15;
CREATE TABLE IF NOT EXISTS compra_pagos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  compra_id BIGINT UNSIGNED NOT NULL,
  mp_pago_id BIGINT UNSIGNED NOT NULL,
  estado VARCHAR(40) NOT NULL,
  detalle_estado VARCHAR(100) NULL,
  validacion ENUM('VALIDADO','REVISION') NOT NULL,
  motivo_revision VARCHAR(80) NULL,
  importe DECIMAL(14,2) NOT NULL,
  importe_reintegrado DECIMAL(14,2) NOT NULL DEFAULT '0.00',
  moneda VARCHAR(10) NOT NULL,
  modo_prueba TINYINT UNSIGNED NOT NULL DEFAULT 1,
  mp_actualizado_en DATETIME(3) NOT NULL,
  aprobado_en DATETIME(3) NULL,
  verificado_en DATETIME(3) NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY(id),
  UNIQUE KEY uq_compra_pagos_mp (mp_pago_id),
  KEY ix_compra_pagos_compra (compra_id),
  KEY ix_compra_pagos_revision (validacion,verificado_en),
  CONSTRAINT fk_compra_pagos_compra FOREIGN KEY(compra_id) REFERENCES compras(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_compra_pagos_id CHECK (mp_pago_id > 0),
  CONSTRAINT ck_compra_pagos_importes CHECK (importe >= 0 AND importe_reintegrado >= 0),
  CONSTRAINT ck_compra_pagos_prueba CHECK (modo_prueba = 1),
  CONSTRAINT ck_compra_pagos_revision CHECK ((validacion='VALIDADO' AND motivo_revision IS NULL) OR (validacion='REVISION' AND motivo_revision IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SELECT 'MP_ETAPA4_PAGOS_OK' AS resultado;
SELECT COUNT(*) AS pagos_registrados FROM compra_pagos;
