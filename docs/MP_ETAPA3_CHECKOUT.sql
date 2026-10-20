-- Factor E | Etapa 3: rutas de compra y preferencia de Checkout Pro | 13/10/2026
-- SOLO DESA. Ejecutar con respaldo y backend detenido. No marca compras pagadas.
USE DB_FactoreDesa_04102026;
SET NAMES utf8mb4;
SET SESSION lock_wait_timeout=15;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='compras' AND COLUMN_NAME='mp_preferencia_estado'), 'SELECT 1', 'ALTER TABLE compras ADD COLUMN mp_preferencia_estado ENUM(''SIN_CREAR'',''CREANDO'',''DISPONIBLE'',''INCIERTA'',''ERROR'') NOT NULL DEFAULT ''SIN_CREAR''');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='compras' AND COLUMN_NAME='mp_preferencia_id'), 'SELECT 1', 'ALTER TABLE compras ADD COLUMN mp_preferencia_id VARCHAR(180) NULL');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='compras' AND COLUMN_NAME='mp_checkout_url'), 'SELECT 1', 'ALTER TABLE compras ADD COLUMN mp_checkout_url VARCHAR(1000) NULL');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='compras' AND COLUMN_NAME='mp_error_codigo'), 'SELECT 1', 'ALTER TABLE compras ADD COLUMN mp_error_codigo VARCHAR(80) NULL');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;

SET @fe_ddl=IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='compras' AND CONSTRAINT_NAME='ck_compras_mp'), 'SELECT 1', 'ALTER TABLE compras ADD CONSTRAINT ck_compras_mp CHECK (mp_preferencia_estado <> ''DISPONIBLE'' OR (mp_preferencia_id IS NOT NULL AND mp_checkout_url IS NOT NULL))');
PREPARE fe_stmt FROM @fe_ddl; EXECUTE fe_stmt; DEALLOCATE PREPARE fe_stmt;
SELECT 'MP_ETAPA3_CHECKOUT_OK' AS resultado;
