-- Benjamin Orellana - 05/11/2026 - Fixture aislada de credenciales cifradas.
CREATE TABLE agenda_google_conexiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  refresh_cifrado TEXT NULL,
  intento_cifrado TEXT NULL,
  revision TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3))
);
