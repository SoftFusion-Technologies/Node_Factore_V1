-- Factor E | Cierre DESA | Solo consultas; no muestra credenciales.
USE DB_FactoreDesa_04102026;
SET SESSION time_zone = '+00:00';

-- Todos los resultados de ERROR deben ser 0.

-- ERROR: ALUMNOS_SIN_FICHA
SELECT COUNT(*) AS cantidad FROM usuarios WHERE rol='ALUMNO' AND cliente_id IS NULL;

-- ERROR: CUENTAS_ACTIVAS_SIN_PASSWORD
SELECT COUNT(*) AS cantidad FROM usuarios WHERE estado='ACTIVO' AND (password_hash IS NULL OR password_hash='');

-- ERROR: ACCESOS_A_ADMINISTRADORES
SELECT COUNT(*) AS cantidad FROM curso_accesos a JOIN usuarios u ON u.id=a.usuario_id WHERE u.rol<>'ALUMNO';

-- ERROR: SELECCION_ACTIVA_VACIA
SELECT COUNT(*) AS cantidad FROM curso_accesos a WHERE a.estado='ACTIVO' AND a.alcance='SELECCION' AND NOT EXISTS (SELECT 1 FROM curso_acceso_lecciones al WHERE al.acceso_id=a.id AND al.estado='HABILITADA');

-- ERROR: LECCIONES_PUBLICADAS_SIN_VIDEO
SELECT COUNT(*) AS cantidad FROM curso_lecciones l LEFT JOIN archivos a ON a.id=l.video_archivo_id WHERE l.estado='PUBLICADA' AND (a.id IS NULL OR a.tipo<>'VIDEO' OR a.estado<>'DISPONIBLE');

-- ERROR: MATERIALES_INVALIDOS
SELECT COUNT(*) AS cantidad FROM curso_materiales m LEFT JOIN archivos a ON a.id=m.archivo_id WHERE a.id IS NULL OR a.tipo<>'DOCUMENTO' OR a.estado<>'DISPONIBLE';

-- ERROR: IMAGENES_INVALIDAS
SELECT COUNT(*) AS cantidad FROM (
    SELECT portada_archivo_id AS archivo_id FROM cursos WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT portada_archivo_id FROM curso_lecciones WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT logo_archivo_id FROM comercios_amigos WHERE logo_archivo_id IS NOT NULL
  ) r LEFT JOIN archivos a ON a.id=r.archivo_id WHERE a.id IS NULL OR a.tipo<>'IMAGEN' OR a.estado<>'DISPONIBLE';

-- ERROR: PROGRESO_INCOHERENTE
SELECT COUNT(*) AS cantidad FROM leccion_progreso WHERE (estado='COMPLETADA' AND completada_en IS NULL) OR (estado='EN_CURSO' AND completada_en IS NOT NULL);

-- ERROR: PROGRESO_DUPLICADO
SELECT COUNT(*) AS cantidad FROM (SELECT usuario_id,leccion_id FROM leccion_progreso GROUP BY usuario_id,leccion_id HAVING COUNT(*)>1) d;

-- ERROR: ELIMINADOS_SIN_COMPROBANTE
SELECT COUNT(*) AS cantidad FROM archivos a WHERE a.estado='ELIMINADO' AND NOT EXISTS (SELECT 1 FROM archivos_eliminaciones e WHERE e.archivo_id=a.id AND e.estado='COMPLETADA');

-- ERROR: COMPROBANTES_INCOHERENTES
SELECT COUNT(*) AS cantidad FROM archivos_eliminaciones e JOIN archivos a ON a.id=e.archivo_id WHERE e.estado='COMPLETADA' AND a.estado<>'ELIMINADO';

-- ERROR: REFERENCIAS_A_ARCHIVOS_RETIRADOS
SELECT COUNT(*) AS cantidad FROM (
    SELECT video_archivo_id AS archivo_id FROM curso_lecciones WHERE video_archivo_id IS NOT NULL
    UNION ALL SELECT portada_archivo_id FROM curso_lecciones WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT portada_archivo_id FROM cursos WHERE portada_archivo_id IS NOT NULL
    UNION ALL SELECT logo_archivo_id FROM comercios_amigos WHERE logo_archivo_id IS NOT NULL
    UNION ALL SELECT archivo_id FROM curso_materiales
  ) r JOIN archivos a ON a.id=r.archivo_id WHERE a.estado IN ('SUBIENDO','PENDIENTE_ELIMINACION','ELIMINADO');

-- ERROR: CAMPUS_CON_ACCESO_INVALIDO
SELECT COUNT(*) AS cantidad FROM vw_campus_lecciones_habilitadas h
    JOIN curso_accesos a ON a.id=h.acceso_id JOIN usuarios u ON u.id=h.usuario_id
    JOIN crm_clientes cl ON cl.id=u.cliente_id JOIN cursos c ON c.id=h.curso_id
    JOIN curso_lecciones l ON l.id=h.leccion_id JOIN curso_modulos m ON m.id=l.modulo_id
    JOIN archivos av ON av.id=l.video_archivo_id
    LEFT JOIN curso_acceso_lecciones al ON al.acceso_id=a.id AND al.leccion_id=l.id
    WHERE a.estado<>'ACTIVO' OR a.inicio_en>UTC_TIMESTAMP(3) OR (a.vence_en IS NOT NULL AND a.vence_en<=UTC_TIMESTAMP(3))
      OR u.rol<>'ALUMNO' OR u.estado<>'ACTIVO' OR cl.activo<>1 OR c.estado<>'PUBLICADO'
      OR m.estado<>'ACTIVO' OR l.estado<>'PUBLICADA' OR av.tipo<>'VIDEO' OR av.estado<>'DISPONIBLE'
      OR (a.alcance='SELECCION' AND al.id IS NULL)
      OR (al.id IS NOT NULL AND (al.estado<>'HABILITADA' OR al.inicio_en>UTC_TIMESTAMP(3) OR al.vence_en<=UTC_TIMESTAMP(3)));

-- ERROR: CAMPUS_COMERCIOS_OCULTOS
SELECT COUNT(*) AS cantidad FROM vw_campus_comercios_visibles v JOIN comercios_amigos c ON c.id=v.id WHERE c.activo<>1 OR c.mostrar_a_usuarios<>1;

-- ERROR: PORCENTAJES_INVALIDOS
SELECT COUNT(*) AS cantidad FROM vw_campus_progreso_cursos WHERE lecciones_habilitadas<1 OR lecciones_completadas<0 OR lecciones_completadas>lecciones_habilitadas OR porcentaje<0 OR porcentaje>100;

-- Avisos: revisar; no equivalen a corrupción de datos.

-- AVISO: ELIMINACIONES_PENDIENTES
SELECT COUNT(*) AS cantidad FROM archivos_eliminaciones WHERE estado<>'COMPLETADA';

-- AVISO: SUBIDAS_ABANDONADAS
SELECT COUNT(*) AS cantidad FROM archivos WHERE estado='SUBIENDO' AND creado_en<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR);

-- AVISO: CURSOS_PUBLICADOS_SIN_CONTENIDO_APTO
SELECT COUNT(*) AS cantidad FROM cursos c WHERE c.estado='PUBLICADO' AND NOT EXISTS (
    SELECT 1 FROM curso_lecciones l JOIN curso_modulos m ON m.id=l.modulo_id AND m.curso_id=l.curso_id
    JOIN archivos a ON a.id=l.video_archivo_id WHERE l.curso_id=c.id AND l.estado='PUBLICADA'
      AND m.estado='ACTIVO' AND a.tipo='VIDEO' AND a.estado='DISPONIBLE');

-- Progreso actual: comparar con campus y Seguimiento.
SELECT u.id AS usuario_id, u.nombre AS alumno, c.id AS curso_id, c.titulo AS curso,
 p.lecciones_habilitadas, p.lecciones_completadas, p.porcentaje, p.ultimo_acceso_en
FROM vw_campus_progreso_cursos p
JOIN usuarios u ON u.id=p.usuario_id JOIN cursos c ON c.id=p.curso_id
ORDER BY u.id,c.id;

-- Estado actual y avance histórico: conservar aunque se suspenda o revoque.
SELECT e.id AS acceso_id, e.usuario_id, e.curso_id, e.estado_temporal, e.inicio_en, e.vence_en,
 COUNT(p.id) AS lecciones_iniciadas_historial,
 SUM(CASE WHEN p.estado='COMPLETADA' THEN 1 ELSE 0 END) AS lecciones_completadas_historial
FROM vw_accesos_estado e LEFT JOIN leccion_progreso p ON p.usuario_id=e.usuario_id AND p.curso_id=e.curso_id
GROUP BY e.id,e.usuario_id,e.curso_id,e.estado_temporal,e.inicio_en,e.vence_en
ORDER BY e.id;

-- Primera compleción: COMPLETADA debe tener 1 evento; EN_CURSO, 0.
SELECT p.id AS progreso_id,p.usuario_id,p.curso_id,p.leccion_id,p.estado,COUNT(a.id) AS eventos_complecion
FROM leccion_progreso p LEFT JOIN auditoria_eventos a
 ON a.entidad='leccion_progreso' AND a.entidad_id=p.id AND a.usuario_id=p.usuario_id AND a.accion='LECCION_COMPLETADA'
GROUP BY p.id,p.usuario_id,p.curso_id,p.leccion_id,p.estado ORDER BY p.id;

-- Historial operativo de la prueba, sin motivos ni datos internos.
SELECT acceso_id,accion,realizado_por,creado_en FROM curso_accesos_historial ORDER BY id;

-- Estos SELECT no comprueban el disco: completar con validar-desa.js --db --hash.
