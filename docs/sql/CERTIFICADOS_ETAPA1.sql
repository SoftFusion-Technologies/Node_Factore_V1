-- Benjamin Orellana - 24/10/2026 - Configuración y registro de diplomas. No emite certificados ni cambia accesos.
USE DB_FactoreDesa_04102026;

DELIMITER $$
DROP PROCEDURE IF EXISTS fe_certificados_etapa1_20261024$$
CREATE PROCEDURE fe_certificados_etapa1_20261024()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='cursos' AND COLUMN_NAME='certificado_carga_horaria') THEN
    ALTER TABLE cursos ADD COLUMN certificado_carga_horaria DECIMAL(6,2) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='cursos' AND COLUMN_NAME='certificado_habilitado') THEN
    ALTER TABLE cursos ADD COLUMN certificado_habilitado TINYINT UNSIGNED NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='cursos' AND CONSTRAINT_NAME='ck_cursos_certificado_horas') THEN
    ALTER TABLE cursos ADD CONSTRAINT ck_cursos_certificado_horas
      CHECK (certificado_carga_horaria IS NULL OR certificado_carga_horaria BETWEEN 0.01 AND 9999.99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='cursos' AND CONSTRAINT_NAME='ck_cursos_certificado_flag') THEN
    ALTER TABLE cursos ADD CONSTRAINT ck_cursos_certificado_flag CHECK (certificado_habilitado IN (0,1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='cursos' AND CONSTRAINT_NAME='ck_cursos_certificado_config') THEN
    ALTER TABLE cursos ADD CONSTRAINT ck_cursos_certificado_config
      CHECK (certificado_habilitado = 0 OR certificado_carga_horaria IS NOT NULL);
  END IF;
END$$
CALL fe_certificados_etapa1_20261024()$$
DROP PROCEDURE fe_certificados_etapa1_20261024$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS curso_certificados (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  curso_id BIGINT UNSIGNED NOT NULL,
  alumno_nombre VARCHAR(180) NOT NULL,
  curso_titulo VARCHAR(180) NOT NULL,
  carga_horaria DECIMAL(6,2) NOT NULL,
  lecciones_requeridas INT UNSIGNED NOT NULL,
  lecciones_completadas INT UNSIGNED NOT NULL,
  plantilla_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  emitido_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_certificado_usuario_curso (usuario_id, curso_id),
  KEY ix_certificados_curso (curso_id),
  CONSTRAINT fk_certificados_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_certificados_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_certificado_horas CHECK (carga_horaria BETWEEN 0.01 AND 9999.99),
  CONSTRAINT ck_certificado_lecciones CHECK (lecciones_requeridas >= 1 AND lecciones_completadas = lecciones_requeridas),
  CONSTRAINT ck_certificado_plantilla CHECK (plantilla_version >= 1),
  CONSTRAINT ck_certificado_alumno CHECK (CHAR_LENGTH(TRIM(alumno_nombre)) > 0),
  CONSTRAINT ck_certificado_curso CHECK (CHAR_LENGTH(TRIM(curso_titulo)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT id, titulo, certificado_habilitado, certificado_carga_horaria FROM cursos ORDER BY id;
SELECT COUNT(*) AS certificados_emitidos FROM curso_certificados;
