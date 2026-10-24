-- Benjamin Orellana - 22/10/2026 - Configuración comercial; no habilita usuarios ni crea cobros.
USE DB_FactoreDesa_04102026;

CREATE TABLE IF NOT EXISTS agenda_venta_configuracion (
  -- Benjamin Orellana - 22/10/2026 - ID fijo: MySQL no admite AUTO_INCREMENT en columnas usadas por CHECK.
  id BIGINT UNSIGNED NOT NULL,
  precio DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  moneda CHAR(3) NOT NULL DEFAULT 'ARS',
  acceso_duracion_cantidad INT UNSIGNED NULL DEFAULT 1,
  acceso_duracion_unidad ENUM('DIAS','MESES','SIN_VENCIMIENTO') NOT NULL DEFAULT 'MESES',
  venta_habilitada TINYINT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  actualizado_por BIGINT UNSIGNED NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_agenda_venta_actualizado_por (actualizado_por),
  CONSTRAINT ck_agenda_venta_unica CHECK (id = 1),
  CONSTRAINT ck_agenda_venta_precio CHECK (precio >= 0),
  CONSTRAINT ck_agenda_venta_moneda CHECK (moneda = 'ARS'),
  CONSTRAINT ck_agenda_venta_habilitada CHECK (venta_habilitada IN (0,1)),
  CONSTRAINT ck_agenda_venta_precio_habilitada CHECK (venta_habilitada = 0 OR precio > 0),
  CONSTRAINT ck_agenda_venta_duracion CHECK (
    (acceso_duracion_unidad = 'SIN_VENCIMIENTO' AND acceso_duracion_cantidad IS NULL)
    OR (acceso_duracion_unidad = 'DIAS' AND acceso_duracion_cantidad IS NOT NULL AND acceso_duracion_cantidad BETWEEN 1 AND 3650)
    OR (acceso_duracion_unidad = 'MESES' AND acceso_duracion_cantidad IS NOT NULL AND acceso_duracion_cantidad BETWEEN 1 AND 120)
  ),
  CONSTRAINT ck_agenda_venta_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_venta_actualizado_por FOREIGN KEY (actualizado_por)
    REFERENCES usuarios (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Se puede repetir: conserva el precio, la duración y el estado ya configurados.
INSERT INTO agenda_venta_configuracion (id) VALUES (1)
ON DUPLICATE KEY UPDATE id = 1;

SELECT id, precio, moneda, acceso_duracion_cantidad, acceso_duracion_unidad,
       venta_habilitada, version
FROM agenda_venta_configuracion;
