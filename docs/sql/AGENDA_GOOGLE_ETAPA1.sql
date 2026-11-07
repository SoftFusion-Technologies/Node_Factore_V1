-- Benjamin Orellana - 05/11/2026 - Guardar únicamente credenciales cifradas y estado de conexión, sin eventos.
CREATE TABLE IF NOT EXISTS agenda_google_conexiones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  refresh_cifrado TEXT NULL,
  intento_cifrado TEXT NULL,
  revision CHAR(36) NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_agenda_google_usuario (usuario_id),
  CONSTRAINT fk_agenda_google_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
