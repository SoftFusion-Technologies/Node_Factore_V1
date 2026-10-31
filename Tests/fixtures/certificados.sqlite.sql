CREATE TABLE curso_certificados (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  alumno_nombre VARCHAR(180) NOT NULL,
  curso_titulo VARCHAR(180) NOT NULL,
  carga_horaria NUMERIC NOT NULL,
  lecciones_requeridas INTEGER NOT NULL,
  lecciones_completadas INTEGER NOT NULL,
  plantilla_version INTEGER NOT NULL DEFAULT 1,
  emitido_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT uq_certificado_usuario_curso UNIQUE (usuario_id, curso_id),
  CONSTRAINT fk_certificados_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_certificados_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_certificado_horas CHECK (carga_horaria BETWEEN 0.01 AND 9999.99),
  CONSTRAINT ck_certificado_lecciones CHECK (lecciones_requeridas >= 1 AND lecciones_completadas = lecciones_requeridas),
  CONSTRAINT ck_certificado_plantilla CHECK (plantilla_version >= 1),
  CONSTRAINT ck_certificado_alumno CHECK (CHAR_LENGTH(TRIM(alumno_nombre)) > 0),
  CONSTRAINT ck_certificado_curso CHECK (CHAR_LENGTH(TRIM(curso_titulo)) > 0)
);

