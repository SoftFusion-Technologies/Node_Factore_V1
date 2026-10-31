/* Benjamin Orellana - 30/10/2026 - Emisión propia, completa e idempotente con datos originales y auditoría transaccional. */
import { Op, literal, Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import Usuarios from '../../Models/Usuario/MD_TB_Usuarios.js';
import Clientes from '../../Models/Cliente/MD_TB_Clientes.js';
import Sesiones from '../../Models/Usuario/MD_TB_UsuariosSesiones.js';
import Cursos from '../../Models/Curso/MD_TB_Cursos.js';
import Accesos from '../../Models/Acceso/MD_TB_CursoAccesos.js';
import Certificados from '../../Models/Certificado/MD_TB_CursoCertificados.js';
import Auditoria from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { hashToken } from '../../utils/password.utils.js';
import { camposPermitidos, exigir, id } from '../../utils/validacion.utils.js';
import { consulta } from '../../utils/listados.utils.js';
import { ahoraDB, estadoTemporal } from '../Acceso/permisoAcceso.service.js';
import { seleccionar } from '../Campus/campusAcceso.service.js';
import { generarDiploma } from './diplomaPdf.service.js';

const atributos = ['curso_id', 'alumno_nombre', 'curso_titulo', 'carga_horaria', 'emitido_en'];
function publico(row) { return Object.fromEntries(atributos.map(key => [key, row.get(key)])); }
async function validarSesion(req, session, transaction) {
  const current = await Sesiones.scope('conHash').findOne({ where: { id: session.id, usuario_id: session.usuario.id,
    token_hash: hashToken(req.sessionToken), revocada_en: null, vence_en: { [Op.gt]: literal('UTC_TIMESTAMP(3)') } },
    attributes: ['id'], transaction, lock: transaction.LOCK.SHARE });
  exigir(current, 401, 'SESION_INVALIDA', 'Iniciar sesión para continuar.');
}
async function identidad(req, session, transaction, emitir) {
  // El orden cliente -> cuenta coincide con las operaciones administrativas. La cuenta serializa emisiones simultáneas.
  const cliente = await Clientes.findByPk(session.usuario.cliente_id, { attributes: ['id', 'activo'], transaction, lock: transaction.LOCK.SHARE });
  const user = await Usuarios.findByPk(session.usuario.id, { attributes: ['id', 'nombre', 'cliente_id', 'rol', 'estado', 'cambiar_password'],
    transaction, lock: emitir ? transaction.LOCK.UPDATE : transaction.LOCK.SHARE });
  exigir(user?.estado === 'ACTIVO' && user.rol === 'ALUMNO' && user.cambiar_password === 0
    && String(user.cliente_id) === String(cliente?.id) && cliente.activo === 1,
  401, 'SESION_INVALIDA', 'La cuenta no está habilitada.');
  await validarSesion(req, session, transaction);
  return user;
}
async function condiciones(userId, curso, acceso, transaction) {
  const now = await ahoraDB(transaction);
  const [counts] = await seleccionar(`SELECT COUNT(*) AS requeridas,
    COALESCE(SUM(CASE WHEN p.estado = 'COMPLETADA' AND p.completada_en IS NOT NULL THEN 1 ELSE 0 END), 0) AS completadas,
    COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM vw_campus_lecciones_habilitadas h
      WHERE h.usuario_id = ? AND h.curso_id = l.curso_id AND h.leccion_id = l.id) THEN 1 ELSE 0 END), 0) AS habilitadas
    FROM curso_lecciones l JOIN curso_modulos m ON m.id = l.modulo_id AND m.curso_id = l.curso_id
    LEFT JOIN leccion_progreso p ON p.usuario_id = ? AND p.curso_id = l.curso_id AND p.leccion_id = l.id
    WHERE l.curso_id = ? AND l.estado = 'PUBLICADA' AND m.estado = 'ACTIVO'`, [userId, userId, curso.id], transaction);
  const requeridas = Number(counts.requeridas), completadas = Number(counts.completadas);
  let estado = 'LISTO';
  if (curso.certificado_habilitado !== 1 || !curso.certificado_carga_horaria) estado = 'DESHABILITADO';
  else if (curso.estado !== 'PUBLICADO' || estadoTemporal(acceso, now) !== 'ACTIVO') estado = 'ACCESO_NO_VIGENTE';
  else if (acceso.alcance !== 'COMPLETO') estado = 'ACCESO_PARCIAL';
  else if (!requeridas) estado = 'SIN_CONTENIDO';
  else if (Number(counts.habilitadas) !== requeridas) estado = 'ACCESO_RESTRINGIDO';
  else if (completadas !== requeridas) estado = 'PENDIENTE';
  return { estado, lecciones_requeridas: requeridas, lecciones_completadas: completadas,
    carga_horaria: curso.certificado_carga_horaria, certificado: null };
}

export async function certificadoPropio(req, session, { emitir = false, pdf = false } = {}) {
  consulta(req.query);
  if (emitir) {
    exigir(typeof req.headers.origin === 'string', 403, 'ORIGEN_REQUERIDO', 'La emisión requiere un origen permitido.');
    camposPermitidos(req.body, [], { vacio: true });
  }
  const cursoId = id(req.params?.curso_id, 'curso_id');
  return db.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
    const user = await identidad(req, session, transaction, emitir);
    // Nunca se acepta un ID de diploma ni un usuario recibido del navegador.
    const original = await Certificados.findOne({ where: { usuario_id: user.id, curso_id: cursoId }, transaction });
    if (original) {
      const buffer = pdf ? await generarDiploma(original.get({ plain: true })) : null;
      await validarSesion(req, session, transaction);
      return { data: { estado: 'EMITIDO', certificado: publico(original) }, buffer, creado: false };
    }
    exigir(!pdf, 404, 'CERTIFICADO_NO_EMITIDO', 'Primero emití tu certificado.');
    const curso = await Cursos.findByPk(cursoId, { transaction, lock: transaction.LOCK.SHARE });
    const acceso = curso && await Accesos.findOne({ where: { usuario_id: user.id, curso_id: cursoId }, transaction,
      lock: emitir ? transaction.LOCK.UPDATE : transaction.LOCK.SHARE });
    exigir(curso && acceso, 404, 'NO_ENCONTRADO', 'Curso no disponible.');
    const estado = await condiciones(user.id, curso, acceso, transaction);
    if (!emitir) return { data: estado };
    exigir(estado.estado === 'LISTO', 409, 'CERTIFICADO_NO_DISPONIBLE', 'Completá el curso y verificá tu acceso para emitir.');
    const row = await Certificados.create({ usuario_id: user.id, curso_id: cursoId, alumno_nombre: user.nombre,
      curso_titulo: curso.titulo, carga_horaria: curso.certificado_carga_horaria,
      lecciones_requeridas: estado.lecciones_requeridas, lecciones_completadas: estado.lecciones_completadas,
      plantilla_version: 1, emitido_en: await ahoraDB(transaction) }, { transaction });
    // Si la plantilla o fuente falla, se revierte la emisión. La descarga posterior podrá regenerarse sin nueva fecha.
    await generarDiploma(row.get({ plain: true }));
    await Auditoria.create({ usuario_id: user.id, accion: 'CERTIFICADO_EMITIDO', entidad: 'curso_certificados', entidad_id: row.id,
      detalle: { curso_id: cursoId, lecciones_requeridas: estado.lecciones_requeridas, plantilla_version: 1 } }, { transaction });
    await validarSesion(req, session, transaction);
    exigir((await condiciones(user.id, curso, acceso, transaction)).estado === 'LISTO',
      409, 'CERTIFICADO_NO_DISPONIBLE', 'El acceso cambió. Actualizá el curso.');
    return { data: { estado: 'EMITIDO', certificado: publico(row) }, creado: true };
  });
}
