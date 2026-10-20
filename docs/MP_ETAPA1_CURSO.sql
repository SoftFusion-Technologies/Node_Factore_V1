-- Factor E | Mercado Pago etapa 1: configurar cursos | 13/10/2026
-- Ejecutar completo en DESA, con respaldo y backend detenido.
-- Solo agrega tres columnas y dos CHECK. No modifica accesos ni compras.
USE DB_FactoreDesa_04102026;
SET NAMES utf8mb4;
SET SESSION lock_wait_timeout=15;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cursos' AND COLUMN_NAME='venta_online_habilitada'), 'SELECT 1', 'ALTER TABLE cursos ADD COLUMN venta_online_habilitada TINYINT UNSIGNED NOT NULL DEFAULT 0');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cursos' AND COLUMN_NAME='acceso_duracion_cantidad'), 'SELECT 1', 'ALTER TABLE cursos ADD COLUMN acceso_duracion_cantidad INT UNSIGNED NOT NULL DEFAULT 1');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cursos' AND COLUMN_NAME='acceso_duracion_unidad'), 'SELECT 1', 'ALTER TABLE cursos ADD COLUMN acceso_duracion_unidad ENUM(''DIAS'',''MESES'') NOT NULL DEFAULT ''MESES''');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='cursos' AND CONSTRAINT_NAME='ck_cursos_venta_online'), 'SELECT 1', 'ALTER TABLE cursos ADD CONSTRAINT ck_cursos_venta_online CHECK (venta_online_habilitada IN (0,1))');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='cursos' AND CONSTRAINT_NAME='ck_cursos_acceso_duracion'), 'SELECT 1', 'ALTER TABLE cursos ADD CONSTRAINT ck_cursos_acceso_duracion CHECK ((acceso_duracion_unidad=''DIAS'' AND acceso_duracion_cantidad BETWEEN 1 AND 3650) OR (acceso_duracion_unidad=''MESES'' AND acceso_duracion_cantidad BETWEEN 1 AND 120))');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SELECT 'MP_ETAPA1_CURSO_OK' AS resultado;
SELECT id,titulo,estado,visible_catalogo,venta_online_habilitada,acceso_duracion_cantidad,acceso_duracion_unidad FROM cursos ORDER BY id;
