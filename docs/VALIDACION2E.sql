-- Factor E | Etapa 2E | Solo SELECT; no muestra contraseñas, tokens ni rutas.
-- Ejecutar en DB_FactoreDesa_04102026 seleccionada en MySQL Workbench.
SELECT DATABASE() AS base_actual, VERSION() AS version_motor;

SELECT e.id, u.nombre AS alumno, u.estado AS estado_cuenta, c.titulo AS curso,
       c.estado AS estado_curso, e.alcance, e.estado_temporal,
       e.inicio_en AS inicio_utc, e.vence_en AS vencimiento_utc
FROM vw_accesos_estado e
JOIN usuarios u ON u.id = e.usuario_id
JOIN cursos c ON c.id = e.curso_id
ORDER BY e.id;

-- Debe devolver cero: no se asignan cursos a administradores.
SELECT COUNT(*) AS accesos_asignados_a_admin
FROM curso_accesos a JOIN usuarios u ON u.id = a.usuario_id
WHERE u.rol <> 'ALUMNO';

-- Debe devolver cero: se suspende al retirar el último video seleccionado.
SELECT COUNT(*) AS selecciones_activas_vacias
FROM curso_accesos a
WHERE a.alcance = 'SELECCION' AND a.estado = 'ACTIVO'
  AND NOT EXISTS (SELECT 1 FROM curso_acceso_lecciones al
                  WHERE al.acceso_id = a.id AND al.estado = 'HABILITADA');

-- Debe devolver cero: ventanas habilitadas completamente fuera del curso.
SELECT COUNT(*) AS excepciones_fuera_de_ventana
FROM curso_acceso_lecciones al JOIN curso_accesos a ON a.id = al.acceso_id
WHERE al.estado = 'HABILITADA'
  AND ((al.vence_en IS NOT NULL AND al.vence_en <= a.inicio_en)
    OR (a.vence_en IS NOT NULL AND al.inicio_en IS NOT NULL AND al.inicio_en >= a.vence_en));

SELECT e.id, u.nombre AS alumno, c.titulo AS curso, e.vence_en AS vencimiento_utc
FROM vw_accesos_estado e
JOIN usuarios u ON u.id = e.usuario_id JOIN cursos c ON c.id = e.curso_id
WHERE e.estado_temporal = 'ACTIVO' AND e.vence_en > UTC_TIMESTAMP(3)
  AND e.vence_en <= DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY)
ORDER BY e.vence_en, e.id;

SELECT h.acceso_id, h.id AS historial_id, h.accion, u.nombre AS realizado_por,
       h.creado_en AS fecha_utc
FROM curso_accesos_historial h JOIN usuarios u ON u.id = h.realizado_por
ORDER BY h.acceso_id, h.id;

-- Los accesos sin historial de alta deberían ser cero si todos se crearon con 2E.
SELECT COUNT(*) AS accesos_sin_alta_auditada
FROM curso_accesos a
WHERE NOT EXISTS (SELECT 1 FROM curso_accesos_historial h
                  WHERE h.acceso_id = a.id AND h.accion = 'ASIGNADO');

-- Esta consulta es informativa: el progreso de asignaciones revocadas/vencidas se conserva.
SELECT e.id AS acceso_id, e.estado_temporal, COUNT(p.id) AS lecciones_con_progreso,
       SUM(CASE WHEN p.estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS completadas_historicas
FROM vw_accesos_estado e
LEFT JOIN leccion_progreso p ON p.usuario_id = e.usuario_id AND p.curso_id = e.curso_id
GROUP BY e.id, e.estado_temporal
ORDER BY e.id;
