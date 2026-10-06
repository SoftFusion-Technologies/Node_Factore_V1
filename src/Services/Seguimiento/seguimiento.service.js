/* Benjamin Orellana - 06/10/2026 - Seguimiento administrativo de formación. */
import { QueryTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import { consulta, busqueda, opcionesListado } from '../../utils/listados.utils.js';
import { id, opcion } from '../../utils/validacion.utils.js';
import { ahoraDB, estadosTemporales } from '../Acceso/permisoAcceso.service.js';

export const avances = ['SIN_INICIAR', 'EN_CURSO', 'COMPLETADO', 'SIN_CONTENIDO'];
const cte = `WITH seguimiento AS (
 SELECT CAST(e.id AS CHAR) AS id, CAST(e.usuario_id AS CHAR) AS usuario_id,
 CAST(e.curso_id AS CHAR) AS curso_id, CAST(u.cliente_id AS CHAR) AS cliente_id,
 u.nombre AS alumno, u.email, u.estado AS estado_cuenta, cl.nombre AS cliente,
 cl.activo AS ficha_activa, c.titulo AS curso, c.estado AS estado_curso,
 e.alcance, e.estado_temporal, e.inicio_en, e.vence_en,
 COALESCE(v.lecciones_habilitadas,0) AS lecciones_habilitadas,
 COALESCE(v.lecciones_completadas,0) AS lecciones_completadas,
 v.porcentaje,
 COALESCE(h.lecciones_iniciadas,0) AS lecciones_iniciadas_historial,
 COALESCE(h.completadas,0) AS lecciones_completadas_historial,
 h.ultimo_acceso_en,
 CASE WHEN v.lecciones_habilitadas IS NULL THEN 'SIN_CONTENIDO'
      WHEN v.lecciones_completadas = v.lecciones_habilitadas THEN 'COMPLETADO'
      WHEN COALESCE(i.iniciadas,0)=0 THEN 'SIN_INICIAR' ELSE 'EN_CURSO' END AS avance,
 CASE WHEN e.estado_temporal='ACTIVO' AND e.vence_en > :ahora
      AND e.vence_en <= :hasta7 THEN 1 ELSE 0 END AS vence_en_7_dias
 FROM vw_accesos_estado e
 JOIN usuarios u ON u.id=e.usuario_id AND u.rol='ALUMNO'
 JOIN cursos c ON c.id=e.curso_id
 LEFT JOIN crm_clientes cl ON cl.id=u.cliente_id
 LEFT JOIN vw_campus_progreso_cursos v ON v.usuario_id=e.usuario_id AND v.curso_id=e.curso_id
 LEFT JOIN (SELECT usuario_id,curso_id,COUNT(*) AS lecciones_iniciadas,
   SUM(CASE WHEN estado='COMPLETADA' THEN 1 ELSE 0 END) AS completadas,
   MAX(ultimo_acceso_en) AS ultimo_acceso_en FROM leccion_progreso GROUP BY usuario_id,curso_id
 ) h ON h.usuario_id=e.usuario_id AND h.curso_id=e.curso_id
 LEFT JOIN (SELECT h.usuario_id,h.curso_id,COUNT(p.id) AS iniciadas
   FROM vw_campus_lecciones_habilitadas h JOIN leccion_progreso p
   ON p.usuario_id=h.usuario_id AND p.curso_id=h.curso_id AND p.leccion_id=h.leccion_id
   GROUP BY h.usuario_id,h.curso_id
 ) i ON i.usuario_id=e.usuario_id AND i.curso_id=e.curso_id
)`;
async function reloj(transaction) {
 const now = await ahoraDB(transaction);
 // Fechas ligadas como valores UTC, nunca se usa el reloj del navegador.
 const sqlDate = date => date.toISOString().replace('T',' ').replace('Z','');
 return { ahora: sqlDate(now), hasta7: sqlDate(new Date(now.getTime()+7*86400000)), hasta30: sqlDate(new Date(now.getTime()+30*86400000)), consultado_en: now };
}
const select = (sql,replacements,transaction) => db.query(sql,{replacements,type:QueryTypes.SELECT,transaction});
function filtros(query, replacements) {
 const where = [], q = busqueda(query.q);
 if(q){where.push('(alumno LIKE :q OR email LIKE :q OR curso LIKE :q OR cliente LIKE :q)');replacements.q=`%${q}%`;}
 for(const field of ['usuario_id','curso_id'])if(query[field]!==undefined){replacements[field]=id(query[field],field);where.push(`${field}=:${field}`);}
 if(query.estado_temporal!==undefined){replacements.estado=opcion(query.estado_temporal,'estado_temporal',estadosTemporales);where.push('estado_temporal=:estado');}
 if(query.avance!==undefined){replacements.avance=opcion(query.avance,'avance',avances);where.push('avance=:avance');}
 if(query.vencimiento!==undefined){const days=opcion(query.vencimiento,'vencimiento',['7','30']);where.push(`estado_temporal='ACTIVO' AND vence_en > :ahora AND vence_en <= :hasta${days}`);}
 return where.length?' WHERE '+where.join(' AND '):'';
}
function paginacion(query,orders,defaultOrder) {
 const result=opcionesListado(query,orders,defaultOrder);
 return { ...result, orden: result.order.map(([col,dir])=>`${col==='id'?'CAST(id AS UNSIGNED)':col} ${dir}`).join(', '),
   limite:result.limit===undefined?'':' LIMIT :limite OFFSET :offset' };
}
function meta(p,total) {
 return p.limit===undefined?{paginado:false,total}:{paginado:true,pagina:p.pagina,por_pagina:p.limit,total,total_paginas:Math.ceil(total/p.limit)};
}
export async function listadoSeguimiento(input) {
 const query=consulta(input,['usuario_id','curso_id','estado_temporal','avance','vencimiento']);
 const p=paginacion(query,['id','alumno','curso','vence_en','ultimo_acceso_en','porcentaje'],'alumno');
 return db.transaction({readOnly:true},async transaction=>{
   const replacements=await reloj(transaction), where=filtros(query,replacements);
   const [summary]=await select(cte+` SELECT COUNT(*) AS total, COUNT(DISTINCT usuario_id) AS alumnos,
     COALESCE(SUM(vence_en_7_dias),0) AS vencen_en_7_dias,
     COALESCE(SUM(CASE WHEN avance='COMPLETADO' THEN 1 ELSE 0 END),0) AS completados,
     COALESCE(SUM(CASE WHEN avance='SIN_INICIAR' THEN 1 ELSE 0 END),0) AS sin_iniciar,
     COALESCE(SUM(CASE WHEN avance='SIN_CONTENIDO' THEN 1 ELSE 0 END),0) AS sin_contenido
     FROM seguimiento`+where,replacements,transaction);
   const data=await select(cte+' SELECT * FROM seguimiento'+where+' ORDER BY '+p.orden+p.limite,
    {...replacements,limite:p.limit,offset:p.offset},transaction);
   const resumen=Object.fromEntries(Object.entries(summary).map(([k,v])=>[k,Number(v)]));
   return {data,meta:meta(p,resumen.total),resumen,consultado_en:replacements.consultado_en};
 });
}
export async function detalleSeguimiento(accesoId,input) {
 const acceso=id(accesoId), query=consulta(input,['estado_progreso','habilitada']);
 const p=paginacion(query,['id','titulo','ultimo_acceso_en'],'id');
 return db.transaction({readOnly:true},async transaction=>{
   const replacements={...await reloj(transaction),acceso};
   const [data]=await select(cte+' SELECT * FROM seguimiento WHERE id=:acceso',replacements,transaction);
   if(!data)return null;
   const lessonCte=`WITH lecciones AS (
    SELECT CAST(l.id AS CHAR) AS id, l.titulo, CAST(m.id AS CHAR) AS modulo_id,
    m.titulo AS modulo, m.estado AS estado_modulo, l.estado AS estado_leccion,
    CASE WHEN h.leccion_id IS NULL THEN 0 ELSE 1 END AS habilitada,
    COALESCE(p.estado,'SIN_INICIAR') AS estado_progreso,
    COALESCE(p.posicion_segundos,0) AS posicion_segundos,
    p.iniciada_en,p.ultimo_acceso_en,p.completada_en
    FROM curso_lecciones l JOIN curso_modulos m ON m.id=l.modulo_id AND m.curso_id=l.curso_id
    LEFT JOIN leccion_progreso p ON p.leccion_id=l.id AND p.curso_id=l.curso_id AND p.usuario_id=:usuario
    LEFT JOIN vw_campus_lecciones_habilitadas h ON h.leccion_id=l.id AND h.curso_id=l.curso_id AND h.acceso_id=:acceso
    WHERE l.curso_id=:curso
   )`;
   const where=[],q=busqueda(query.q);
   if(q){replacements.q=`%${q}%`;where.push('(titulo LIKE :q OR modulo LIKE :q)');}
   if(query.estado_progreso!==undefined){replacements.progreso=opcion(query.estado_progreso,'estado_progreso',['SIN_INICIAR','EN_CURSO','COMPLETADA']);where.push('estado_progreso=:progreso');}
   if(query.habilitada!==undefined){replacements.habilitada=Number(opcion(query.habilitada,'habilitada',['0','1']));where.push('habilitada=:habilitada');}
   replacements.usuario=data.usuario_id;replacements.curso=data.curso_id;
   const clause=where.length?' WHERE '+where.join(' AND '):'';
   const [count]=await select(lessonCte+' SELECT COUNT(*) AS total FROM lecciones'+clause,replacements,transaction);
   const lecciones=await select(lessonCte+' SELECT * FROM lecciones'+clause+' ORDER BY '+p.orden+p.limite,
    {...replacements,limite:p.limit,offset:p.offset},transaction);
   return {data,lecciones,meta:meta(p,Number(count.total)),consultado_en:replacements.consultado_en};
 });
}
