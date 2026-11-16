-- Fixture aislado de las 18 tablas: conserva FK, claves únicas y CHECK.
-- SQLite no reproduce bloqueos, collation ni límites DECIMAL/UNSIGNED de MySQL.

CREATE TABLE crm_clientes (
  id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'PERSONA' CHECK (tipo IN ('PERSONA','EMPRESA')),
  nombre TEXT NOT NULL,
  razon_social TEXT NULL,
  documento TEXT NULL,
  email TEXT NULL,
  telefono TEXT NULL,
  rubro TEXT NULL,
  ciudad TEXT NULL,
  estado_comercial TEXT NOT NULL DEFAULT 'PROSPECTO' CHECK (estado_comercial IN ('PROSPECTO','CLIENTE','INACTIVO')),
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  CONSTRAINT ck_clientes_activo CHECK (activo IN (0,1))
);

CREATE TRIGGER crm_clientes_actualizar AFTER UPDATE ON crm_clientes BEGIN
 UPDATE crm_clientes SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE usuarios (
  id INTEGER NOT NULL,
  cliente_id INTEGER NULL,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NULL,
  rol TEXT NOT NULL DEFAULT 'ALUMNO' CHECK (rol IN ('ADMIN','ALUMNO')),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACTIVO','BLOQUEADO','INACTIVO')),
  cambiar_password INTEGER NOT NULL DEFAULT 0,
  ultimo_ingreso_en TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (cliente_id),
  UNIQUE (email),
  CONSTRAINT ck_usuarios_cambiar_password CHECK (cambiar_password IN (0,1)),
  CONSTRAINT fk_usuarios_cliente FOREIGN KEY (cliente_id) REFERENCES crm_clientes(id) ON DELETE RESTRICT
);

CREATE TRIGGER usuarios_actualizar AFTER UPDATE ON usuarios BEGIN
 UPDATE usuarios SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE archivos (
  id INTEGER NOT NULL,
  uuid TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('VIDEO','IMAGEN','DOCUMENTO')),
  nombre_original TEXT NOT NULL,
  nombre_guardado TEXT NOT NULL,
  ruta_relativa TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  tamanio_bytes INTEGER NOT NULL,
  duracion_segundos INTEGER NULL,
  sha256 TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'SUBIENDO' CHECK (estado IN ('SUBIENDO','DISPONIBLE','PENDIENTE_ELIMINACION','ELIMINADO')),
  subido_por INTEGER NOT NULL,
  eliminado_en TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (uuid),
  UNIQUE (ruta_relativa),
  CONSTRAINT ck_archivos_tamanio CHECK (tamanio_bytes > 0),
  CONSTRAINT ck_archivos_eliminado CHECK (
    (estado = 'ELIMINADO' AND eliminado_en IS NOT NULL) OR
    (estado <> 'ELIMINADO' AND eliminado_en IS NULL)
  ),
  CONSTRAINT fk_archivos_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TRIGGER archivos_actualizar AFTER UPDATE ON archivos BEGIN
 UPDATE archivos SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE comercios_amigos (
  id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL,
  rubro TEXT NULL,
  descripcion TEXT NULL,
  logo_archivo_id INTEGER NULL,
  ciudad TEXT NULL,
  direccion_publica TEXT NULL,
  telefono_publico TEXT NULL,
  email_publico TEXT NULL,
  web_url TEXT NULL,
  instagram_url TEXT NULL,
  observaciones_internas TEXT NULL,
  mostrar_a_usuarios INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (slug),
  CONSTRAINT ck_comercios_visible CHECK (mostrar_a_usuarios IN (0,1)),
  CONSTRAINT ck_comercios_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_comercios_logo FOREIGN KEY (logo_archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT
);

CREATE TRIGGER comercios_amigos_actualizar AFTER UPDATE ON comercios_amigos BEGIN
 UPDATE comercios_amigos SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE comercio_clientes (
  id INTEGER NOT NULL,
  comercio_id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  funcion TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (comercio_id, cliente_id),
  CONSTRAINT fk_comercio_clientes_comercio FOREIGN KEY (comercio_id) REFERENCES comercios_amigos(id) ON DELETE CASCADE,
  CONSTRAINT fk_comercio_clientes_cliente FOREIGN KEY (cliente_id) REFERENCES crm_clientes(id) ON DELETE RESTRICT
);

CREATE TABLE clientes_notas (
  id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  contenido TEXT NOT NULL,
  creado_por INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  CONSTRAINT fk_notas_cliente FOREIGN KEY (cliente_id) REFERENCES crm_clientes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_notas_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TRIGGER clientes_notas_actualizar AFTER UPDATE ON clientes_notas BEGIN
 UPDATE clientes_notas SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE cursos (
  id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  slug TEXT NOT NULL,
  descripcion_corta TEXT NULL,
  descripcion TEXT NULL,
  portada_archivo_id INTEGER NULL,
  precio NUMERIC NULL,
  moneda TEXT NOT NULL DEFAULT 'ARS',
  modalidad TEXT NOT NULL DEFAULT 'VIRTUAL' CHECK (modalidad IN ('VIRTUAL','PRESENCIAL','MIXTA')),
  estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PUBLICADO','ARCHIVADO')),
  visible_catalogo INTEGER NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0,
  venta_online_habilitada INTEGER NOT NULL DEFAULT 0 CHECK (venta_online_habilitada IN (0,1)),
  acceso_duracion_cantidad INTEGER NOT NULL DEFAULT 1,
  acceso_duracion_unidad TEXT NOT NULL DEFAULT 'MESES' CHECK (acceso_duracion_unidad IN ('DIAS','MESES')),
  creado_por INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (slug),
  CONSTRAINT ck_cursos_precio CHECK (precio IS NULL OR precio >= 0),
  CONSTRAINT ck_cursos_duracion CHECK ((acceso_duracion_unidad='DIAS' AND acceso_duracion_cantidad BETWEEN 1 AND 3650) OR (acceso_duracion_unidad='MESES' AND acceso_duracion_cantidad BETWEEN 1 AND 120)),
  CONSTRAINT ck_cursos_visible CHECK (visible_catalogo IN (0,1)),
  CONSTRAINT fk_cursos_portada FOREIGN KEY (portada_archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cursos_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TRIGGER cursos_actualizar AFTER UPDATE ON cursos BEGIN
 UPDATE cursos SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE curso_modulos (
  id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','ARCHIVADO')),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (id, curso_id),
  CONSTRAINT fk_modulos_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE RESTRICT
);

CREATE TRIGGER curso_modulos_actualizar AFTER UPDATE ON curso_modulos BEGIN
 UPDATE curso_modulos SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE curso_lecciones (
  id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  modulo_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT NULL,
  video_archivo_id INTEGER NULL,
  portada_archivo_id INTEGER NULL,
  estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PUBLICADA','ARCHIVADA')),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (id, curso_id),
  CONSTRAINT fk_lecciones_modulo_curso FOREIGN KEY (modulo_id, curso_id) REFERENCES curso_modulos(id, curso_id) ON DELETE RESTRICT,
  CONSTRAINT fk_lecciones_video FOREIGN KEY (video_archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lecciones_portada FOREIGN KEY (portada_archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT
);

CREATE TRIGGER curso_lecciones_actualizar AFTER UPDATE ON curso_lecciones BEGIN
 UPDATE curso_lecciones SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE curso_materiales (
  id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  leccion_id INTEGER NULL,
  archivo_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  CONSTRAINT ck_materiales_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_materiales_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_materiales_leccion_curso FOREIGN KEY (leccion_id, curso_id) REFERENCES curso_lecciones(id, curso_id) ON DELETE RESTRICT,
  CONSTRAINT fk_materiales_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT
);

CREATE TABLE curso_accesos (
  id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  alcance TEXT NOT NULL DEFAULT 'COMPLETO' CHECK (alcance IN ('COMPLETO','SELECCION')),
  estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','SUSPENDIDO','REVOCADO')),
  inicio_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  vence_en TEXT NULL,
  asignado_por INTEGER NOT NULL,
  observaciones_internas TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (usuario_id, curso_id),
  UNIQUE (id, curso_id),
  CONSTRAINT ck_accesos_fechas CHECK (vence_en IS NULL OR vence_en > inicio_en),
  CONSTRAINT fk_accesos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_accesos_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_accesos_asignador FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TRIGGER curso_accesos_actualizar AFTER UPDATE ON curso_accesos BEGIN
 UPDATE curso_accesos SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE curso_acceso_lecciones (
  id INTEGER NOT NULL,
  acceso_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  leccion_id INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'HABILITADA' CHECK (estado IN ('HABILITADA','BLOQUEADA')),
  inicio_en TEXT NULL,
  vence_en TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (acceso_id, leccion_id),
  CONSTRAINT ck_acceso_lecciones_fechas CHECK (inicio_en IS NULL OR vence_en IS NULL OR vence_en > inicio_en),
  CONSTRAINT fk_acceso_lecciones_acceso_curso FOREIGN KEY (acceso_id, curso_id) REFERENCES curso_accesos(id, curso_id) ON DELETE RESTRICT,
  CONSTRAINT fk_acceso_lecciones_leccion_curso FOREIGN KEY (leccion_id, curso_id) REFERENCES curso_lecciones(id, curso_id) ON DELETE RESTRICT
);

CREATE TRIGGER curso_acceso_lecciones_actualizar AFTER UPDATE ON curso_acceso_lecciones BEGIN
 UPDATE curso_acceso_lecciones SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE curso_accesos_historial (
  id INTEGER NOT NULL,
  acceso_id INTEGER NOT NULL,
  accion TEXT NOT NULL CHECK (accion IN ('ASIGNADO','RENOVADO','SUSPENDIDO','REACTIVADO','REVOCADO','ALCANCE_MODIFICADO','LECCION_MODIFICADA')),
  realizado_por INTEGER NOT NULL,
  motivo TEXT NULL,
  datos_antes TEXT NULL,
  datos_despues TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  CONSTRAINT fk_acceso_historial_acceso FOREIGN KEY (acceso_id) REFERENCES curso_accesos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_acceso_historial_usuario FOREIGN KEY (realizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TABLE leccion_progreso (
  id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  leccion_id INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO','COMPLETADA')),
  posicion_segundos INTEGER NOT NULL DEFAULT 0,
  iniciada_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  ultimo_acceso_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  completada_en TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (usuario_id, leccion_id),
  CONSTRAINT ck_progreso_completada CHECK (
    (estado = 'COMPLETADA' AND completada_en IS NOT NULL) OR
    (estado = 'EN_CURSO' AND completada_en IS NULL)
  ),
  CONSTRAINT fk_progreso_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_progreso_leccion_curso FOREIGN KEY (leccion_id, curso_id) REFERENCES curso_lecciones(id, curso_id) ON DELETE RESTRICT
);

CREATE TRIGGER leccion_progreso_actualizar AFTER UPDATE ON leccion_progreso BEGIN
 UPDATE leccion_progreso SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;

CREATE TABLE usuarios_sesiones (
  id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  vence_en TEXT NOT NULL,
  revocada_en TEXT NULL,
  ultimo_uso_en TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE (token_hash),
  CONSTRAINT ck_sesiones_fechas CHECK (vence_en > creado_en),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TABLE usuarios_tokens (
  id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ACTIVACION','RECUPERACION')),
  token_hash TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  vence_en TEXT NOT NULL,
  usado_en TEXT NULL,
  revocado_en TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE (token_hash),
  CONSTRAINT ck_tokens_fechas CHECK (vence_en > creado_en),
  CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TABLE auditoria_eventos (
  id INTEGER NOT NULL,
  usuario_id INTEGER NULL,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id INTEGER NULL,
  detalle TEXT NULL,
  ip TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TABLE archivos_eliminaciones (
  id INTEGER NOT NULL,
  archivo_id INTEGER NOT NULL,
  solicitado_por INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_PROCESO','COMPLETADA','ERROR')),
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT NULL,
  proximo_intento_en TEXT NULL,
  completada_en TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (archivo_id),
  CONSTRAINT ck_eliminaciones_completada CHECK (
    (estado = 'COMPLETADA' AND completada_en IS NOT NULL) OR
    (estado <> 'COMPLETADA' AND completada_en IS NULL)
  ),
  CONSTRAINT fk_eliminaciones_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_eliminaciones_usuario FOREIGN KEY (solicitado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TRIGGER archivos_eliminaciones_actualizar AFTER UPDATE ON archivos_eliminaciones BEGIN
 UPDATE archivos_eliminaciones SET actualizado_en=UTC_TIMESTAMP(3) WHERE id=NEW.id;
END;


-- Vistas de permisos idénticas al esquema MySQL; ejecución aislada en SQLite.
CREATE VIEW vw_accesos_estado AS
SELECT a.id, a.usuario_id, a.curso_id, a.alcance, a.estado,
       a.inicio_en, a.vence_en, a.asignado_por,
       CASE
         WHEN a.estado = 'REVOCADO' THEN 'REVOCADO'
         WHEN a.estado = 'SUSPENDIDO' THEN 'SUSPENDIDO'
         WHEN a.vence_en IS NOT NULL AND a.vence_en <= UTC_TIMESTAMP(3) THEN 'VENCIDO'
         WHEN a.inicio_en > UTC_TIMESTAMP(3) THEN 'PROGRAMADO'
         ELSE 'ACTIVO'
       END AS estado_temporal
FROM curso_accesos a;

CREATE VIEW vw_campus_lecciones_habilitadas AS
SELECT a.usuario_id, a.id AS acceso_id, a.curso_id,
       l.modulo_id, l.id AS leccion_id, l.titulo,
       l.video_archivo_id, l.portada_archivo_id,
       m.orden AS modulo_orden, l.orden AS leccion_orden,
       a.inicio_en AS curso_inicio_en, a.vence_en AS curso_vence_en,
       al.inicio_en AS leccion_inicio_en, al.vence_en AS leccion_vence_en
FROM curso_accesos a
JOIN usuarios u ON u.id = a.usuario_id AND u.estado = 'ACTIVO' AND u.rol = 'ALUMNO'
JOIN crm_clientes cl ON cl.id = u.cliente_id AND cl.activo = 1
JOIN cursos c ON c.id = a.curso_id AND c.estado = 'PUBLICADO'
JOIN curso_modulos m ON m.curso_id = c.id AND m.estado = 'ACTIVO'
JOIN curso_lecciones l ON l.modulo_id = m.id AND l.curso_id = c.id AND l.estado = 'PUBLICADA'
JOIN archivos av ON av.id = l.video_archivo_id AND av.tipo = 'VIDEO' AND av.estado = 'DISPONIBLE'
LEFT JOIN curso_acceso_lecciones al ON al.acceso_id = a.id AND al.leccion_id = l.id AND al.curso_id = c.id
WHERE a.estado = 'ACTIVO'
  AND a.inicio_en <= UTC_TIMESTAMP(3)
  AND (a.vence_en IS NULL OR a.vence_en > UTC_TIMESTAMP(3))
  AND (
    (a.alcance = 'COMPLETO' AND al.id IS NULL)
    OR (
      al.id IS NOT NULL AND al.estado = 'HABILITADA'
      AND (al.inicio_en IS NULL OR al.inicio_en <= UTC_TIMESTAMP(3))
      AND (al.vence_en IS NULL OR al.vence_en > UTC_TIMESTAMP(3))
    )
  );

CREATE VIEW vw_campus_progreso_cursos AS
SELECT h.usuario_id, h.curso_id,
       COUNT(*) AS lecciones_habilitadas,
       SUM(CASE WHEN p.estado = 'COMPLETADA' THEN 1 ELSE 0 END) AS lecciones_completadas,
       ROUND(100.0 * SUM(CASE WHEN p.estado = 'COMPLETADA' THEN 1 ELSE 0 END) / COUNT(*), 2) AS porcentaje,
       MAX(p.ultimo_acceso_en) AS ultimo_acceso_en
FROM vw_campus_lecciones_habilitadas h
LEFT JOIN leccion_progreso p ON p.usuario_id = h.usuario_id AND p.leccion_id = h.leccion_id
GROUP BY h.usuario_id, h.curso_id;

CREATE VIEW vw_campus_comercios_visibles AS
SELECT c.id, c.nombre, c.slug, c.rubro, c.descripcion,
       CASE WHEN av.estado = 'DISPONIBLE' AND av.tipo = 'IMAGEN' THEN c.logo_archivo_id ELSE NULL END AS logo_archivo_id,
       c.ciudad, c.direccion_publica, c.telefono_publico, c.email_publico,
       c.web_url, c.instagram_url, c.orden
FROM comercios_amigos c
LEFT JOIN archivos av ON av.id = c.logo_archivo_id
WHERE c.activo = 1 AND c.mostrar_a_usuarios = 1;

CREATE TABLE compras (
  id INTEGER NOT NULL,
  referencia TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  solicitud_hash TEXT NOT NULL,
  comprador_nombre TEXT NOT NULL,
  comprador_email TEXT NOT NULL,
  usuario_id INTEGER NULL,
  estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE','PAGADA','CANCELADA')) DEFAULT 'PENDIENTE',
  moneda TEXT NOT NULL DEFAULT 'ARS',
  total NUMERIC NOT NULL,
  vence_en TEXT NOT NULL,
  pagada_en TEXT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  mp_preferencia_estado TEXT NOT NULL DEFAULT 'SIN_CREAR' CHECK (mp_preferencia_estado IN ('SIN_CREAR','CREANDO','DISPONIBLE','INCIERTA','ERROR')),
  mp_preferencia_id TEXT NULL,
  mp_checkout_url TEXT NULL,
  mp_error_codigo TEXT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (referencia),
  CONSTRAINT fk_compras_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT ck_compras_mp CHECK (mp_preferencia_estado <> 'DISPONIBLE' OR (mp_preferencia_id IS NOT NULL AND mp_checkout_url IS NOT NULL)),
  CONSTRAINT ck_compras_total CHECK (total > 0),
  CONSTRAINT ck_compras_moneda CHECK (moneda = 'ARS'),
  CONSTRAINT ck_compras_ventana CHECK (vence_en > creado_en),
  CONSTRAINT ck_compras_pago CHECK ((estado = 'PAGADA' AND pagada_en IS NOT NULL) OR (estado <> 'PAGADA' AND pagada_en IS NULL))
);

CREATE TABLE compra_items (
  id INTEGER NOT NULL,
  compra_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  slug TEXT NOT NULL,
  precio_unitario NUMERIC NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'ARS',
  acceso_duracion_cantidad INTEGER NOT NULL,
  acceso_duracion_unidad TEXT NOT NULL CHECK (acceso_duracion_unidad IN ('DIAS','MESES')),
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE (compra_id,curso_id),
  CONSTRAINT fk_compra_items_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE RESTRICT,
  CONSTRAINT fk_compra_items_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE RESTRICT,
  CONSTRAINT ck_compra_items_precio CHECK (precio_unitario > 0),
  CONSTRAINT ck_compra_items_moneda CHECK (moneda = 'ARS'),
  CONSTRAINT ck_compra_items_duracion CHECK ((acceso_duracion_unidad='DIAS' AND acceso_duracion_cantidad BETWEEN 1 AND 3650) OR (acceso_duracion_unidad='MESES' AND acceso_duracion_cantidad BETWEEN 1 AND 120))
);

CREATE TABLE compra_pagos (
  id INTEGER NOT NULL PRIMARY KEY,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE RESTRICT,
  mp_pago_id INTEGER NOT NULL UNIQUE CHECK(mp_pago_id>0),
  estado TEXT NOT NULL,
  detalle_estado TEXT NULL,
  validacion TEXT NOT NULL CHECK(validacion IN ('VALIDADO','REVISION')),
  motivo_revision TEXT NULL,
  importe NUMERIC NOT NULL CHECK(importe>=0),
  importe_reintegrado NUMERIC NOT NULL DEFAULT '0.00' CHECK(importe_reintegrado>=0),
  moneda TEXT NOT NULL,
  modo_prueba INTEGER NOT NULL DEFAULT 1 CHECK(modo_prueba IN (0,1)),
  mp_actualizado_en TEXT NOT NULL,
  aprobado_en TEXT NULL,
  verificado_en TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en TEXT NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CHECK ((validacion='VALIDADO' AND motivo_revision IS NULL) OR (validacion='REVISION' AND motivo_revision IS NOT NULL))
);
