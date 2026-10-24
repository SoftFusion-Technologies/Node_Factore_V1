-- Benjamin Orellana - 22/10/2026 - Configuración comercial aislada, no ejecutar en MySQL.
CREATE TABLE agenda_venta_configuracion (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  precio NUMERIC NOT NULL DEFAULT 0.00,
  moneda CHAR(3) NOT NULL DEFAULT 'ARS',
  acceso_duracion_cantidad INTEGER NULL DEFAULT 1,
  acceso_duracion_unidad TEXT NOT NULL DEFAULT 'MESES',
  venta_habilitada INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  actualizado_por INTEGER NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
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
);
CREATE INDEX ix_agenda_venta_actualizado_por ON agenda_venta_configuracion(actualizado_por);
CREATE TRIGGER update_agenda_venta AFTER UPDATE ON agenda_venta_configuracion BEGIN UPDATE agenda_venta_configuracion SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id; END;
INSERT OR IGNORE INTO agenda_venta_configuracion(id) VALUES(1);
