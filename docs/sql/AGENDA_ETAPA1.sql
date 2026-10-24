-- Benjamin Orellana - 20/10/2026 - Mi agenda: etapa 1, estructura y relaciones.
-- Solo agrega seis tablas. No inserta accesos, no toca cursos ni compras.
-- MySQL 8.0.16+; ejecutar con el backend detenido y respaldo realizado.
USE DB_FactoreDesa_04102026;
SET SESSION time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS agenda_accesos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  estado ENUM('ACTIVO','SUSPENDIDO','REVOCADO') NOT NULL DEFAULT 'REVOCADO',
  inicio_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  vence_en DATETIME(3) NULL,
  otorgado_por BIGINT UNSIGNED NULL,
  motivo VARCHAR(500) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_agenda_accesos_usuario (usuario_id),
  KEY ix_agenda_accesos_otorgado (otorgado_por),
  KEY ix_agenda_accesos_estado_vence (estado, vence_en),
  CONSTRAINT ck_agenda_accesos_fechas CHECK (vence_en IS NULL OR vence_en > inicio_en),
  CONSTRAINT ck_agenda_accesos_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_accesos_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_agenda_accesos_otorgado_por FOREIGN KEY (otorgado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agenda_preferencias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tema ENUM('CLARO','OSCURO') NOT NULL DEFAULT 'CLARO',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_agenda_preferencias_usuario (usuario_id),
  CONSTRAINT ck_agenda_preferencias_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_preferencias_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agenda_dias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  frase VARCHAR(500) NOT NULL DEFAULT '',
  prioridad_1_texto VARCHAR(500) NOT NULL DEFAULT '',
  prioridad_1_cumplida TINYINT UNSIGNED NOT NULL DEFAULT 0,
  prioridad_2_texto VARCHAR(500) NOT NULL DEFAULT '',
  prioridad_2_cumplida TINYINT UNSIGNED NOT NULL DEFAULT 0,
  prioridad_3_texto VARCHAR(500) NOT NULL DEFAULT '',
  prioridad_3_cumplida TINYINT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_agenda_dias_usuario_fecha (usuario_id, fecha),
  UNIQUE KEY uq_agenda_dias_id_usuario (id, usuario_id),
  CONSTRAINT ck_agenda_dias_p1_flag CHECK (prioridad_1_cumplida IN (0,1)),
  CONSTRAINT ck_agenda_dias_p1_texto CHECK (prioridad_1_cumplida = 0 OR CHAR_LENGTH(TRIM(prioridad_1_texto)) > 0),
  CONSTRAINT ck_agenda_dias_p2_flag CHECK (prioridad_2_cumplida IN (0,1)),
  CONSTRAINT ck_agenda_dias_p2_texto CHECK (prioridad_2_cumplida = 0 OR CHAR_LENGTH(TRIM(prioridad_2_texto)) > 0),
  CONSTRAINT ck_agenda_dias_p3_flag CHECK (prioridad_3_cumplida IN (0,1)),
  CONSTRAINT ck_agenda_dias_p3_texto CHECK (prioridad_3_cumplida = 0 OR CHAR_LENGTH(TRIM(prioridad_3_texto)) > 0),
  CONSTRAINT ck_agenda_dias_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_dias_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agenda_tareas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  dia_id BIGINT UNSIGNED NOT NULL,
  texto VARCHAR(2000) NOT NULL,
  categoria ENUM('OPERATIVO','COMERCIAL','ESTRATEGICO','PERSONAL') NOT NULL,
  hora TIME NULL,
  prioridad TINYINT UNSIGNED NOT NULL DEFAULT 3,
  recordatorio TINYINT UNSIGNED NOT NULL DEFAULT 0,
  recordada_en DATETIME(3) NULL,
  completada TINYINT UNSIGNED NOT NULL DEFAULT 0,
  completada_en DATETIME(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_agenda_tareas_dia_usuario (dia_id, usuario_id),
  KEY ix_agenda_tareas_usuario_hora (usuario_id, recordatorio, hora),
  CONSTRAINT ck_agenda_tareas_texto CHECK (CHAR_LENGTH(TRIM(texto)) > 0),
  CONSTRAINT ck_agenda_tareas_hora CHECK (hora IS NULL OR (hora >= '00:00:00' AND hora <= '23:59:00' AND SECOND(hora) = 0)),
  CONSTRAINT ck_agenda_tareas_prioridad CHECK (prioridad IN (1,2,3)),
  CONSTRAINT ck_agenda_tareas_recordatorio CHECK (recordatorio IN (0,1)),
  CONSTRAINT ck_agenda_tareas_recordatorio_hora CHECK (recordatorio = 0 OR hora IS NOT NULL),
  CONSTRAINT ck_agenda_tareas_recordada CHECK (recordada_en IS NULL OR recordatorio = 1),
  CONSTRAINT ck_agenda_tareas_completada CHECK (completada IN (0,1)),
  CONSTRAINT ck_agenda_tareas_completada_fecha CHECK ((completada = 0 AND completada_en IS NULL) OR (completada = 1 AND completada_en IS NOT NULL)),
  CONSTRAINT ck_agenda_tareas_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_tareas_dia_usuario FOREIGN KEY (dia_id, usuario_id) REFERENCES agenda_dias(id, usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agenda_notas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  dia_id BIGINT UNSIGNED NOT NULL,
  texto VARCHAR(4000) NOT NULL,
  cumplida TINYINT UNSIGNED NOT NULL DEFAULT 0,
  orden INT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_agenda_notas_dia_usuario (dia_id, usuario_id),
  KEY ix_agenda_notas_usuario_orden (usuario_id, dia_id, orden, id),
  CONSTRAINT ck_agenda_notas_texto CHECK (CHAR_LENGTH(TRIM(texto)) > 0),
  CONSTRAINT ck_agenda_notas_cumplida CHECK (cumplida IN (0,1)),
  CONSTRAINT ck_agenda_notas_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_notas_dia_usuario FOREIGN KEY (dia_id, usuario_id) REFERENCES agenda_dias(id, usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agenda_tiempo_registros (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  dia_id BIGINT UNSIGNED NOT NULL,
  categoria ENUM('OPERATIVO','COMERCIAL','ESTRATEGICO','PERSONAL') NOT NULL,
  inicio_en DATETIME(3) NOT NULL,
  fin_en DATETIME(3) NULL,
  duracion_segundos INT UNSIGNED NULL,
  en_curso TINYINT UNSIGNED NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_agenda_tiempo_dia_usuario (dia_id, usuario_id),
  UNIQUE KEY uq_agenda_tiempo_abierto (usuario_id, categoria, en_curso),
  CONSTRAINT ck_agenda_tiempo_estado CHECK ((fin_en IS NULL AND duracion_segundos IS NULL AND en_curso IS NOT NULL AND en_curso = 1) OR (fin_en IS NOT NULL AND fin_en >= inicio_en AND duracion_segundos IS NOT NULL AND en_curso IS NULL)),
  CONSTRAINT ck_agenda_tiempo_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_tiempo_registros_dia_usuario FOREIGN KEY (dia_id, usuario_id) REFERENCES agenda_dias(id, usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Primera instalación: 6 tablas y 0 accesos. Repetir no borra datos existentes.
SELECT COUNT(*) AS tablas_agenda
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  AND TABLE_NAME IN ('agenda_accesos', 'agenda_preferencias', 'agenda_dias',
                     'agenda_tareas', 'agenda_notas', 'agenda_tiempo_registros');
SELECT COUNT(*) AS accesos_agenda, COALESCE(SUM(estado = 'ACTIVO'), 0) AS filas_activas
FROM agenda_accesos;
