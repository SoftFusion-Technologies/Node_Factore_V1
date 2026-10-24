CREATE TABLE agenda_compras (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'ARS',
  acceso_duracion_cantidad INTEGER NULL,
  acceso_duracion_unidad TEXT NOT NULL,
  configuracion_version INTEGER NOT NULL,
  entregada_en TEXT NULL,
  acceso_id INTEGER NULL,
  accion TEXT NULL,
  inicio_en TEXT NULL,
  vence_en TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT uq_agenda_compras_compra UNIQUE (compra_id),
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
);
