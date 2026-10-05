/* Benjamin Orellana - 04/10/2026 - Escritura CRM y auditoría en una transacción. */
import db from '../../DataBase/db.js';
import AuditoriaEventosModel from '../../Models/Sistema/MD_TB_AuditoriaEventos.js';
import { administrador } from '../../utils/http.utils.js';
import { literal,Op } from 'sequelize';
import SesionesModel from '../../Models/Usuario/MD_TB_UsuariosSesiones.js';
import { hashToken,tokenValido } from '../../utils/password.utils.js';
import { exigir } from '../../utils/validacion.utils.js';

export async function conAuditoria(req, actor, accion, entidad, operation, options = {}) {
  return db.transaction(options, async transaction => {
    await administrador({ user: { id: actor.id } }, transaction);
    // Las llamadas HTTP protegidas llevan la sesión verificada por el middleware.
    if(req.session!==undefined) {
      exigir(tokenValido(req.sessionToken),401,'SESION_INVALIDA','Iniciar sesión para continuar.');
      const session=await SesionesModel.scope('conHash').findOne({where:{id:req.session.id,usuario_id:actor.id,
        token_hash:hashToken(req.sessionToken),revocada_en:null,vence_en:{[Op.gt]:literal('UTC_TIMESTAMP(3)')}},
        attributes:['id'],transaction,lock:transaction.LOCK.SHARE});
      exigir(session,401,'SESION_INVALIDA','Iniciar sesión para continuar.');
    }
    const result = await operation(transaction);
    // Solo metadatos de la operación: nunca contenido de notas, claves o tokens.
    await AuditoriaEventosModel.create({ usuario_id: actor.id, accion, entidad,
      entidad_id: result.entidadId, detalle: result.detalle ?? null }, { transaction });
    return result.data;
  });
}
