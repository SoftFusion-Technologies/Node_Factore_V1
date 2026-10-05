-- FACTOR E | Etapa 2F | Solo SELECT, sin hashes, tokens ni rutas físicas.
-- Elegir DB_FactoreDesa_04102026 en Workbench; reemplazar usuario_id = 0 por un ALUMNO a revisar.
SELECT DATABASE() AS base_actual, VERSION() AS version_motor;

SELECT u.id, u.nombre, u.email, u.rol, u.estado, u.cambiar_password,
       u.cliente_id, c.activo AS cliente_activo
FROM usuarios u LEFT JOIN crm_clientes c ON c.id = u.cliente_id
ORDER BY u.id;

SELECT h.curso_id, h.modulo_id, h.leccion_id, h.titulo,
       h.curso_inicio_en, h.curso_vence_en, h.leccion_inicio_en, h.leccion_vence_en
FROM vw_campus_lecciones_habilitadas h
WHERE h.usuario_id = 0
ORDER BY h.curso_id, h.modulo_orden, h.modulo_id, h.leccion_orden, h.leccion_id;

SELECT p.curso_id, p.lecciones_habilitadas, p.lecciones_completadas,
       p.porcentaje, p.ultimo_acceso_en
FROM vw_campus_progreso_cursos p WHERE p.usuario_id = 0 ORDER BY p.curso_id;

-- El progreso histórico se conserva aunque el permiso haya vencido o sido revocado.
SELECT p.curso_id, p.leccion_id, p.estado, p.posicion_segundos,
       p.iniciada_en, p.ultimo_acceso_en, p.completada_en
FROM leccion_progreso p WHERE p.usuario_id = 0 ORDER BY p.curso_id, p.leccion_id;

-- Debe devolver cero; tampoco puede aparecer un alumno o cliente inactivo en la vista.
SELECT COUNT(*) AS lecciones_habilitadas_con_permiso_invalido
FROM vw_campus_lecciones_habilitadas h
JOIN vw_accesos_estado e ON e.id = h.acceso_id
JOIN usuarios u ON u.id = h.usuario_id JOIN crm_clientes c ON c.id = u.cliente_id
WHERE e.estado_temporal <> 'ACTIVO' OR u.estado <> 'ACTIVO' OR u.rol <> 'ALUMNO' OR c.activo <> 1;

SELECT co.id, co.nombre, co.rubro, co.ciudad, co.telefono_publico,
       co.email_publico, co.web_url, co.instagram_url
FROM vw_campus_comercios_visibles co ORDER BY co.orden, co.nombre, co.id;

-- Materiales visibles para el alumno: generales o correspondientes a una lección habilitada.
SELECT cm.id, cm.curso_id, cm.leccion_id, cm.titulo, ar.nombre_original, ar.mime_type
FROM curso_materiales cm JOIN archivos ar ON ar.id = cm.archivo_id
WHERE cm.activo = 1 AND ar.tipo = 'DOCUMENTO' AND ar.estado = 'DISPONIBLE'
  AND EXISTS (SELECT 1 FROM vw_campus_lecciones_habilitadas h
              WHERE h.usuario_id = 0 AND h.curso_id = cm.curso_id
                AND (cm.leccion_id IS NULL OR cm.leccion_id = h.leccion_id))
ORDER BY cm.curso_id, cm.orden, cm.id;

-- El estado físico de archivos y los cortes HTTP se verifican en Node; no alcanza un SELECT.
