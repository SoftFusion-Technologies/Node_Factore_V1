/* Benjamin Orellana - 04/10/2026 - Contrato HTTP y administración CRM. */
import UsuariosModel from '../Models/Usuario/MD_TB_Usuarios.js';
import { initRelaciones } from '../Models/relaciones.js';
import { ErrorHttp, exigir, id } from './validacion.utils.js';

initRelaciones();
const adminAttributes = ['id', 'nombre', 'email', 'rol', 'estado', 'cambiar_password'];

export async function administrador(req, transaction) {
  // req.user lo establecerá exclusivamente el middleware de autenticación.
  exigir(req.user?.id !== undefined, 401, 'NO_AUTENTICADO', 'Iniciar sesión para continuar.');
  const usuarioId = id(req.user.id, 'usuario autenticado');
  const user = await UsuariosModel.findByPk(usuarioId, { attributes: adminAttributes,
    ...(transaction ? { transaction, lock: transaction.LOCK.SHARE } : {}) });
  exigir(user && user.estado === 'ACTIVO', 401, 'SESION_INVALIDA', 'La cuenta no está activa.');
  exigir(user.rol === 'ADMIN', 403, 'NO_AUTORIZADO', 'Esta operación requiere administrador.');
  exigir(user.cambiar_password === 0, 403, 'CAMBIAR_PASSWORD', 'Cambiar la contraseña para continuar.');
  return user;
}
export function serializar(value, key = '') {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(item => serializar(item));
  if (typeof value === 'object') {
    const plain = typeof value.toJSON === 'function' ? value.toJSON() : value;
    return Object.fromEntries(Object.entries(plain).filter(([name]) => !['password_hash','token_hash','ruta_relativa','nombre_guardado'].includes(name))
      .map(([name, item]) => [name, serializar(item, name)]));
  }
  if (typeof value === 'bigint') return value.toString();
  if (key === 'id' || key.endsWith('_id') || ['creado_por','subido_por','asignado_por','realizado_por','solicitado_por'].includes(key)) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('ID recibido sin precisión.');
    return String(value);
  }
  if (key.endsWith('_en') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)) {
    return value.replace(' ', 'T') + 'Z';
  }
  return value;
}
export function responderError(error, res) {
  let mapped = error;
  const code = error.original?.code ?? error.parent?.code ?? error.code;
  if (error.name === 'SequelizeUniqueConstraintError' || code === 'ER_DUP_ENTRY') {
    mapped = new ErrorHttp(409, 'DUPLICADO', 'Ya existe un registro con ese email, slug o vínculo.');
  } else if (error.name === 'SequelizeForeignKeyConstraintError' || ['ER_ROW_IS_REFERENCED_2','ER_NO_REFERENCED_ROW_2'].includes(code)) {
    mapped = new ErrorHttp(409, 'RELACION_INVALIDA', 'La referencia no existe o el registro conserva relaciones.');
  } else if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(code)) {
    mapped = new ErrorHttp(409, 'CONCURRENCIA', 'El registro está siendo modificado. Reintentá la operación.');
  } else if (error.name === 'SequelizeValidationError' || ['ER_CHECK_CONSTRAINT_VIOLATED','ER_TRUNCATED_WRONG_VALUE_FOR_FIELD','WARN_DATA_TRUNCATED','ER_DATA_TOO_LONG'].includes(code)) {
    mapped = new ErrorHttp(422, 'DATOS_INVALIDOS', 'Los datos no cumplen las reglas del modelo.');
  }
  if (!(mapped instanceof ErrorHttp)) {
    console.error(JSON.stringify({ event: 'ERROR_CRM', code: code ?? error.name ?? 'ERROR' }));
    mapped = new ErrorHttp(500, 'ERROR_INTERNO', 'No se pudo completar la operación.');
  }
  return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
}
export function controlador(operation) {
  return async (req, res) => {
    try {
      const actor = await administrador(req);
      const result = await operation(req, actor);
      const { status = 200, ...body } = result;
      return res.status(status).json(serializar(body));
    } catch (error) { return responderError(error, res); }
  };
}
