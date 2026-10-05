/* Benjamin Orellana - 05/10/2026 - Guardado del progreso propio con permiso y sesión revalidados. */
import { Op, literal, Transaction } from 'sequelize';
import db from '../../DataBase/db.js';
import Clientes from '../../Models/Cliente/MD_TB_Clientes.js';
import Usuarios from '../../Models/Usuario/MD_TB_Usuarios.js';
import Sesiones from '../../Models/Usuario/MD_TB_UsuariosSesiones.js';
import Cursos from '../../Models/Curso/MD_TB_Cursos.js';
import Accesos from '../../Models/Acceso/MD_TB_CursoAccesos.js';
import Progreso from '../../Models/Campus/MD_TB_LeccionProgreso.js';
import Auditoria from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import Archivos from '../../Models/Archivo/MD_TB_Archivos.js';
import { hashToken } from '../../utils/password.utils.js';
import { camposPermitidos, entero, bandera, id, exigir } from '../../utils/validacion.utils.js';
import { obtenerLeccion } from './campusContenido.service.js';
import { abrirArchivo } from '../Archivo/rutasArchivo.service.js';
import { fechaGuardada } from '../Acceso/permisoAcceso.service.js';

async function sesionEnTransaccion(req, session, transaction) {
  const cliente = await Clientes.findByPk(session.usuario.cliente_id, { attributes: ['id', 'activo'], transaction, lock: transaction.LOCK.SHARE });
  const user = await Usuarios.findByPk(session.usuario.id, { attributes: ['id', 'cliente_id', 'rol', 'estado', 'cambiar_password'], transaction, lock: transaction.LOCK.SHARE });
  exigir(user?.estado === 'ACTIVO' && user.rol === 'ALUMNO' && user.cambiar_password === 0
    && String(user.cliente_id) === String(cliente?.id) && cliente?.activo === 1, 401, 'SESION_INVALIDA', 'La cuenta no está habilitada.');
  return { user, cliente };
}
async function exigirSesion(req, session, transaction) {
  const row = await Sesiones.scope('conHash').findOne({ where: { id: session.id, usuario_id: session.usuario.id,
    token_hash: hashToken(req.sessionToken), revocada_en: null, vence_en: { [Op.gt]: literal('UTC_TIMESTAMP(3)') } },
    attributes: ['id'], transaction, lock: transaction.LOCK.SHARE });
  exigir(row, 401, 'SESION_INVALIDA', 'Iniciar sesión para continuar.');
}
export async function guardarProgreso(req, session) {
  const body = camposPermitidos(req.body, ['posicion_segundos', 'completada']);
  const posicion = body.posicion_segundos === undefined ? undefined : entero(body.posicion_segundos, 'posicion_segundos');
  const completada = body.completada === undefined ? false : Boolean(bandera(body.completada, 'completada'));
  const cursoId = id(req.params?.curso_id, 'curso_id'), leccionId = id(req.params?.leccion_id, 'leccion_id');
  return db.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
    await sesionEnTransaccion(req, session, transaction);
    const curso = await Cursos.findByPk(cursoId, { attributes: ['id'], transaction, lock: transaction.LOCK.SHARE });
    exigir(curso, 404, 'NO_ENCONTRADO', 'Lección no disponible.');
    const acceso = await Accesos.findOne({ where: { usuario_id: session.usuario.id, curso_id: cursoId }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
    exigir(acceso, 404, 'NO_ENCONTRADO', 'Lección no disponible.');
    await exigirSesion(req, session, transaction);
    const lesson = await obtenerLeccion(session.usuario.id, cursoId, leccionId, transaction);
    const file = await Archivos.findByPk(lesson.video_archivo_id, { transaction, lock: transaction.LOCK.SHARE });
    exigir(file?.tipo === 'VIDEO' && file.estado === 'DISPONIBLE', 404, 'ARCHIVO_NO_DISPONIBLE', 'El video no está disponible.');
    let opened;
    try { opened = await abrirArchivo(file.ruta_relativa); }
    catch { exigir(false, 404, 'ARCHIVO_NO_DISPONIBLE', 'El video no está disponible.'); }
    try { exigir(BigInt(opened.stat.size) === BigInt(file.tamanio_bytes), 409, 'ARCHIVO_INCONSISTENTE', 'El video no está disponible.'); }
    finally { await opened.handle.close(); }
    if (posicion !== undefined && lesson.duracion_segundos !== null) exigir(posicion <= Number(lesson.duracion_segundos),
      422, 'POSICION_INVALIDA', 'La posición supera la duración registrada del video.');
    let row = await Progreso.findOne({ where: { usuario_id: session.usuario.id, curso_id: cursoId, leccion_id: leccionId }, transaction, lock: transaction.LOCK.UPDATE });
    const values = { estado: completada || row?.estado === 'COMPLETADA' ? 'COMPLETADA' : 'EN_CURSO',
      completada_en: row?.completada_en ? fechaGuardada(row.completada_en) : (completada ? literal('UTC_TIMESTAMP(3)') : null),
      ultimo_acceso_en: literal('UTC_TIMESTAMP(3)'), actualizado_en: literal('UTC_TIMESTAMP(3)'),
      ...(posicion !== undefined ? { posicion_segundos: posicion } : {}) };
    const primeraComplecion = completada && row?.estado !== 'COMPLETADA';
    if (row) await row.update(values, { transaction });
    else row = await Progreso.create({ usuario_id: session.usuario.id, curso_id: cursoId, leccion_id: leccionId, ...values }, { transaction });
    if (primeraComplecion) await Auditoria.create({ usuario_id: session.usuario.id, accion: 'LECCION_COMPLETADA', entidad: 'leccion_progreso',
      entidad_id: row.id, detalle: { curso_id: cursoId, leccion_id: leccionId } }, { transaction });
    // Una caducidad durante el trabajo no permite confirmar un guardado que ya no está autorizado.
    await exigirSesion(req, session, transaction);
    await obtenerLeccion(session.usuario.id, cursoId, leccionId, transaction);
    await row.reload({ transaction });
    return Object.fromEntries(['id', 'curso_id', 'leccion_id', 'estado', 'posicion_segundos', 'iniciada_en', 'ultimo_acceso_en', 'completada_en'].map(key => [key, row.get(key)]));
  });
}
