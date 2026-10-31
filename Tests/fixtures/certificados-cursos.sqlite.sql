-- Benjamin Orellana - 24/10/2026 - Campos y restricciones del diploma en cursos de la fixture.
ALTER TABLE cursos ADD COLUMN certificado_carga_horaria NUMERIC NULL
  CONSTRAINT ck_cursos_certificado_horas CHECK (certificado_carga_horaria IS NULL OR certificado_carga_horaria BETWEEN 0.01 AND 9999.99);
ALTER TABLE cursos ADD COLUMN certificado_habilitado INTEGER NOT NULL DEFAULT 0
  CONSTRAINT ck_cursos_certificado_flag CHECK (certificado_habilitado IN (0,1))
  CONSTRAINT ck_cursos_certificado_config CHECK (certificado_habilitado = 0 OR certificado_carga_horaria IS NOT NULL);
