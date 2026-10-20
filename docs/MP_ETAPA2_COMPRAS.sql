-- Factor E | Etapa 2: compras e importes | 13/10/2026
-- Solo DESA. Crear tablas antes de arrancar el backend actualizado.
-- No crea pagos, cuentas ni asignaciones. Conserva las tablas existentes.
USE DB_FactoreDesa_04102026;
SET NAMES utf8mb4;
SET SESSION lock_wait_timeout=15;

CREATE TABLE IF NOT EXISTS compras (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referencia CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  solicitud_hash CHAR(64) NOT NULL,
  comprador_nombre VARCHAR(180) NOT NULL,
  comprador_email VARCHAR(254) NOT NULL,
  usuario_id BIGINT UNSIGNED NULL,
  estado ENUM('PENDIENTE','PAGADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  moneda CHAR(3) NOT NULL DEFAULT 'ARS',
  total DECIMAL(14,2) NOT NULL,
  vence_en DATETIME(3) NOT NULL,
  pagada_en DATETIME(3) NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_compras_referencia (referencia),
  KEY ix_compras_usuario (usuario_id),
  KEY ix_compras_estado_vence (estado,vence_en),
  CONSTRAINT fk_compras_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_compras_total CHECK (total > 0),
  CONSTRAINT ck_compras_moneda CHECK (moneda = 'ARS'),
  CONSTRAINT ck_compras_ventana CHECK (vence_en > creado_en),
  CONSTRAINT ck_compras_pago CHECK ((estado = 'PAGADA' AND pagada_en IS NOT NULL) OR (estado <> 'PAGADA' AND pagada_en IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS compra_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  compra_id BIGINT UNSIGNED NOT NULL,
  curso_id BIGINT UNSIGNED NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'ARS',
  acceso_duracion_cantidad INT UNSIGNED NOT NULL,
  acceso_duracion_unidad ENUM('DIAS','MESES') NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_compra_items_curso (compra_id,curso_id),
  KEY ix_compra_items_curso (curso_id),
  CONSTRAINT fk_compra_items_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_compra_items_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_compra_items_precio CHECK (precio_unitario > 0),
  CONSTRAINT ck_compra_items_moneda CHECK (moneda = 'ARS'),
  CONSTRAINT ck_compra_items_duracion CHECK ((acceso_duracion_unidad='DIAS' AND acceso_duracion_cantidad BETWEEN 1 AND 3650) OR (acceso_duracion_unidad='MESES' AND acceso_duracion_cantidad BETWEEN 1 AND 120))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'MP_ETAPA2_COMPRAS_OK' AS resultado;
SELECT (SELECT COUNT(*) FROM compras) AS compras, (SELECT COUNT(*) FROM compra_items) AS items;
