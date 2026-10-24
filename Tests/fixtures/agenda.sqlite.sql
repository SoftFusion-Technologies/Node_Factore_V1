-- Benjamin Orellana - 20/10/2026 - Fixture aislado de Agenda; no ejecutar en MySQL.
-- Las reglas se contrastan con docs/sql/AGENDA_ETAPA1.sql en agenda-modelos.test.js.
CREATE TABLE agenda_accesos (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'REVOCADO',
  inicio_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  vence_en TEXT NULL,
  otorgado_por INTEGER NULL,
  motivo TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT ck_agenda_accesos_fechas CHECK (vence_en IS NULL OR vence_en > inicio_en),
  CONSTRAINT ck_agenda_accesos_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_accesos_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_agenda_accesos_otorgado_por FOREIGN KEY (otorgado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (usuario_id >= 0),
  CHECK (estado IN ('ACTIVO','SUSPENDIDO','REVOCADO')),
  CHECK (otorgado_por >= 0),
  CHECK (version >= 0)
);
CREATE UNIQUE INDEX uq_agenda_accesos_usuario ON agenda_accesos (usuario_id);
CREATE INDEX ix_agenda_accesos_otorgado ON agenda_accesos (otorgado_por);
CREATE INDEX ix_agenda_accesos_estado_vence ON agenda_accesos (estado, vence_en);
CREATE TRIGGER update_agenda_accesos AFTER UPDATE ON agenda_accesos BEGIN UPDATE agenda_accesos SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id; END;

CREATE TABLE agenda_preferencias (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  tema TEXT NOT NULL DEFAULT 'CLARO',
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT ck_agenda_preferencias_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_preferencias_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (usuario_id >= 0),
  CHECK (tema IN ('CLARO','OSCURO')),
  CHECK (version >= 0)
);
CREATE UNIQUE INDEX uq_agenda_preferencias_usuario ON agenda_preferencias (usuario_id);
CREATE TRIGGER update_agenda_preferencias AFTER UPDATE ON agenda_preferencias BEGIN UPDATE agenda_preferencias SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id; END;

CREATE TABLE agenda_dias (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  frase TEXT NOT NULL DEFAULT '',
  prioridad_1_texto TEXT NOT NULL DEFAULT '',
  prioridad_1_cumplida INTEGER NOT NULL DEFAULT 0,
  prioridad_2_texto TEXT NOT NULL DEFAULT '',
  prioridad_2_cumplida INTEGER NOT NULL DEFAULT 0,
  prioridad_3_texto TEXT NOT NULL DEFAULT '',
  prioridad_3_cumplida INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT ck_agenda_dias_p1_flag CHECK (prioridad_1_cumplida IN (0,1)),
  CONSTRAINT ck_agenda_dias_p1_texto CHECK (prioridad_1_cumplida = 0 OR CHAR_LENGTH(TRIM(prioridad_1_texto)) > 0),
  CONSTRAINT ck_agenda_dias_p2_flag CHECK (prioridad_2_cumplida IN (0,1)),
  CONSTRAINT ck_agenda_dias_p2_texto CHECK (prioridad_2_cumplida = 0 OR CHAR_LENGTH(TRIM(prioridad_2_texto)) > 0),
  CONSTRAINT ck_agenda_dias_p3_flag CHECK (prioridad_3_cumplida IN (0,1)),
  CONSTRAINT ck_agenda_dias_p3_texto CHECK (prioridad_3_cumplida = 0 OR CHAR_LENGTH(TRIM(prioridad_3_texto)) > 0),
  CONSTRAINT ck_agenda_dias_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_dias_usuario_id FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (usuario_id >= 0),
  CHECK (prioridad_1_cumplida >= 0),
  CHECK (prioridad_2_cumplida >= 0),
  CHECK (prioridad_3_cumplida >= 0),
  CHECK (version >= 0)
);
CREATE UNIQUE INDEX uq_agenda_dias_usuario_fecha ON agenda_dias (usuario_id, fecha);
CREATE UNIQUE INDEX uq_agenda_dias_id_usuario ON agenda_dias (id, usuario_id);
CREATE TRIGGER update_agenda_dias AFTER UPDATE ON agenda_dias BEGIN UPDATE agenda_dias SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id; END;

CREATE TABLE agenda_tareas (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  dia_id INTEGER NOT NULL,
  texto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  hora TEXT NULL,
  prioridad INTEGER NOT NULL DEFAULT 3,
  recordatorio INTEGER NOT NULL DEFAULT 0,
  recordada_en TEXT NULL,
  completada INTEGER NOT NULL DEFAULT 0,
  completada_en TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT ck_agenda_tareas_texto CHECK (CHAR_LENGTH(TRIM(texto)) > 0),
  CONSTRAINT ck_agenda_tareas_hora CHECK (hora IS NULL OR (hora >= '00:00:00' AND hora <= '23:59:00' AND SECOND(hora) = 0)),
  CONSTRAINT ck_agenda_tareas_prioridad CHECK (prioridad IN (1,2,3)),
  CONSTRAINT ck_agenda_tareas_recordatorio CHECK (recordatorio IN (0,1)),
  CONSTRAINT ck_agenda_tareas_recordatorio_hora CHECK (recordatorio = 0 OR hora IS NOT NULL),
  CONSTRAINT ck_agenda_tareas_recordada CHECK (recordada_en IS NULL OR recordatorio = 1),
  CONSTRAINT ck_agenda_tareas_completada CHECK (completada IN (0,1)),
  CONSTRAINT ck_agenda_tareas_completada_fecha CHECK ((completada = 0 AND completada_en IS NULL) OR (completada = 1 AND completada_en IS NOT NULL)),
  CONSTRAINT ck_agenda_tareas_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_tareas_dia_usuario FOREIGN KEY (dia_id, usuario_id) REFERENCES agenda_dias(id, usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (usuario_id >= 0),
  CHECK (dia_id >= 0),
  CHECK (categoria IN ('OPERATIVO','COMERCIAL','ESTRATEGICO','PERSONAL')),
  CHECK (prioridad >= 0),
  CHECK (recordatorio >= 0),
  CHECK (completada >= 0),
  CHECK (version >= 0)
);
CREATE INDEX ix_agenda_tareas_dia_usuario ON agenda_tareas (dia_id, usuario_id);
CREATE INDEX ix_agenda_tareas_usuario_hora ON agenda_tareas (usuario_id, recordatorio, hora);
CREATE TRIGGER update_agenda_tareas AFTER UPDATE ON agenda_tareas BEGIN UPDATE agenda_tareas SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id; END;

CREATE TABLE agenda_notas (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  dia_id INTEGER NOT NULL,
  texto TEXT NOT NULL,
  cumplida INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT ck_agenda_notas_texto CHECK (CHAR_LENGTH(TRIM(texto)) > 0),
  CONSTRAINT ck_agenda_notas_cumplida CHECK (cumplida IN (0,1)),
  CONSTRAINT ck_agenda_notas_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_notas_dia_usuario FOREIGN KEY (dia_id, usuario_id) REFERENCES agenda_dias(id, usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (usuario_id >= 0),
  CHECK (dia_id >= 0),
  CHECK (cumplida >= 0),
  CHECK (orden >= 0),
  CHECK (version >= 0)
);
CREATE INDEX ix_agenda_notas_dia_usuario ON agenda_notas (dia_id, usuario_id);
CREATE INDEX ix_agenda_notas_usuario_orden ON agenda_notas (usuario_id, dia_id, orden, id);
CREATE TRIGGER update_agenda_notas AFTER UPDATE ON agenda_notas BEGIN UPDATE agenda_notas SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id; END;

CREATE TABLE agenda_tiempo_registros (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  dia_id INTEGER NOT NULL,
  categoria TEXT NOT NULL,
  inicio_en TEXT NOT NULL,
  fin_en TEXT NULL,
  duracion_segundos INTEGER NULL,
  en_curso INTEGER NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT ck_agenda_tiempo_estado CHECK ((fin_en IS NULL AND duracion_segundos IS NULL AND en_curso IS NOT NULL AND en_curso = 1) OR (fin_en IS NOT NULL AND fin_en >= inicio_en AND duracion_segundos IS NOT NULL AND en_curso IS NULL)),
  CONSTRAINT ck_agenda_tiempo_version CHECK (version >= 1),
  CONSTRAINT fk_agenda_tiempo_registros_dia_usuario FOREIGN KEY (dia_id, usuario_id) REFERENCES agenda_dias(id, usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (usuario_id >= 0),
  CHECK (dia_id >= 0),
  CHECK (categoria IN ('OPERATIVO','COMERCIAL','ESTRATEGICO','PERSONAL')),
  CHECK (duracion_segundos >= 0),
  CHECK (en_curso >= 0),
  CHECK (version >= 0)
);
CREATE INDEX ix_agenda_tiempo_dia_usuario ON agenda_tiempo_registros (dia_id, usuario_id);
CREATE UNIQUE INDEX uq_agenda_tiempo_abierto ON agenda_tiempo_registros (usuario_id, categoria, en_curso);
CREATE TRIGGER update_agenda_tiempo_registros AFTER UPDATE ON agenda_tiempo_registros BEGIN UPDATE agenda_tiempo_registros SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id; END;
