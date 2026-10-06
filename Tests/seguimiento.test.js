import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { crearApp } from '../app.js';
import { hashPassword } from '../src/utils/password.utils.js';
import { conectarPrueba } from './adapter-crm.js';
test('Seguimiento: HTTP real, permisos ADMIN, progreso actual e historial con SQLite aislado',async t=>{
 const adapter=await conectarPrueba(db,{fixture:'campus.sqlite.sql'});
 const server=crearApp().listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await adapter.close();});
 const base='http://127.0.0.1:'+server.address().port,password='Clave de prueba Seguimiento 2026',hash=await hashPassword(password);
 const admin=await modelos.usuarios.create({nombre:'Juan',email:'juan@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:hash});
 const client=await modelos.crm_clientes.create({nombre:'Empresa seguimiento',observaciones_internas:'SECRETO CRM'});
 const user=await modelos.usuarios.create({nombre:'Alumno prueba',email:'alumno@example.invalid',cliente_id:client.id,rol:'ALUMNO',estado:'ACTIVO',password_hash:hash});
 const video=await modelos.archivos.create({uuid:'seguimiento-video',tipo:'VIDEO',nombre_original:'prueba.mp4',nombre_guardado:'privado.mp4',ruta_relativa:'videos/privado.mp4',mime_type:'video/mp4',extension:'mp4',tamanio_bytes:16,subido_por:admin.id,estado:'DISPONIBLE'});
 const course=await modelos.cursos.create({titulo:'Motor seguimiento',slug:'motor-seguimiento',estado:'PUBLICADO',creado_por:admin.id});
 const module=await modelos.curso_modulos.create({curso_id:course.id,titulo:'Módulo inicial'});
 const lessons=[];for(let n=1;n<=111;n++)lessons.push(await modelos.curso_lecciones.create({curso_id:course.id,modulo_id:module.id,titulo:'Lección '+String(n).padStart(3,'0'),estado:'PUBLICADA',video_archivo_id:video.id}));
 const now=Date.now(),access=await modelos.curso_accesos.create({usuario_id:user.id,curso_id:course.id,asignado_por:admin.id,inicio_en:new Date(now-100000),vence_en:new Date(now+2*86400000),observaciones_internas:'SECRETO ACCESO'});
 await modelos.leccion_progreso.create({usuario_id:user.id,curso_id:course.id,leccion_id:lessons[0].id,estado:'COMPLETADA',posicion_segundos:13,completada_en:new Date()});
 async function login(email){const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:5173'},body:JSON.stringify({email,password})});assert.equal(res.status,200,await res.clone().text());return res.headers.get('set-cookie').split(';')[0];}
 let adminCookie=await login(admin.email);const studentCookie=await login(user.email);
 async function get(path,cookie=adminCookie){const res=await fetch(base+'/api/admin/seguimiento'+path,{headers:cookie?{Cookie:cookie}:{}});return {status:res.status,body:await res.json()};}
 await t.test('Sin cookie, alumno y cuenta bloqueada no autorizan',async()=>{
  assert.equal((await get('',null)).status,401);assert.equal((await get('?usuario_id='+user.id,studentCookie)).status,403);
  await admin.update({estado:'BLOQUEADO'});assert.equal((await get('')).status,401);await admin.update({estado:'ACTIVO'});adminCookie=await login(admin.email);
 });
 await t.test('Resumen coincide con campus y vencimiento; nunca entrega secretos',async()=>{
  const result=await get('?pagina=1&por_pagina=25');assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.meta.total,1);assert.equal(result.body.resumen.vencen_en_7_dias,1);
  const row=result.body.data[0];assert.equal(String(row.id),String(access.id));assert.equal(Number(row.lecciones_habilitadas),111);assert.equal(Number(row.lecciones_completadas),1);assert.equal(Number(row.porcentaje),0.9);assert.equal(row.avance,'EN_CURSO');
  assert.ok(!JSON.stringify(result.body).includes('SECRETO'));assert.ok(!JSON.stringify(result.body).includes('password_hash'));assert.ok(result.body.consultado_en.endsWith('Z'));
 });
 await t.test('111 lecciones, página 5 y filtros de compleción y permiso',async()=>{
  const result=await get('/'+access.id+'?pagina=5&por_pagina=25');assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.meta.total,111);assert.equal(result.body.lecciones.length,11);
  const filtered=await get('/'+access.id+'?estado_progreso=COMPLETADA&habilitada=1&q=001');assert.equal(filtered.body.meta.total,1);assert.equal(filtered.body.lecciones[0].posicion_segundos,13);
 });
 await t.test('Bloqueo conserva historial y selección calcula 100% sobre lo habilitado',async()=>{
  await modelos.curso_acceso_lecciones.create({acceso_id:access.id,curso_id:course.id,leccion_id:lessons[0].id,estado:'BLOQUEADA'});
  let row=(await get('')).body.data[0];assert.equal(Number(row.lecciones_habilitadas),110);assert.equal(Number(row.lecciones_completadas),0);assert.equal(row.avance,'SIN_INICIAR');assert.equal(Number(row.lecciones_completadas_historial),1);
  const detail=await get('/'+access.id+'?estado_progreso=COMPLETADA');assert.equal(Number(detail.body.lecciones[0].habilitada),0);
  await access.update({alcance:'SELECCION'});await modelos.curso_acceso_lecciones.update({estado:'HABILITADA'},{where:{acceso_id:access.id}});
  row=(await get('?avance=COMPLETADO')).body.data[0];assert.equal(Number(row.porcentaje),100);assert.equal(Number(row.lecciones_habilitadas),1);
 });
 await t.test('Suspensión y revocación no muestran 0% falso; mantienen avance histórico',async()=>{
  for(const estado of ['SUSPENDIDO','REVOCADO']){
   await access.update({estado});const result=await get('?estado_temporal='+estado),row=result.body.data[0];assert.equal(row.porcentaje,null);assert.equal(row.avance,'SIN_CONTENIDO');assert.equal(Number(row.lecciones_completadas_historial),1);assert.equal(result.body.resumen.vencen_en_7_dias,0);
   assert.equal((await get('/'+access.id+'?estado_progreso=COMPLETADA')).body.lecciones.length,1);
  }await access.update({estado:'ACTIVO'});
 });
 await t.test('Cuenta/ficha inactiva y curso archivado excluyen el avance habilitado',async()=>{
  for(const [model,change,restore] of [[user,{estado:'BLOQUEADO'},{estado:'ACTIVO'}],[client,{activo:0},{activo:1}],[course,{estado:'ARCHIVADO'},{estado:'PUBLICADO'}]]){
   await model.update(change);assert.equal((await get('')).body.data[0].avance,'SIN_CONTENIDO');await model.update(restore);
  }
 });
 await t.test('112 asignaciones completas, resumen filtrado y página posterior a 100',async()=>{
  for(let n=1;n<=111;n++){
   const c=await modelos.cursos.create({titulo:'Curso extra '+String(n).padStart(3,'0'),slug:'extra-'+n,estado:'PUBLICADO',creado_por:admin.id});await modelos.curso_accesos.create({usuario_id:user.id,curso_id:c.id,asignado_por:admin.id});
  }
  assert.equal((await get('')).body.data.length,112);
  const page=await get('?q=extra&pagina=5&por_pagina=25&ordenar_por=curso');assert.equal(page.body.meta.total,111);assert.equal(page.body.data.length,11);assert.equal(page.body.resumen.total,111);assert.equal(page.body.resumen.alumnos,1);
  assert.equal((await get('?curso_id='+course.id+'&vencimiento=7')).body.meta.total,1);assert.equal((await get('?vencimiento=30&estado_temporal=REVOCADO')).body.meta.total,0);
 });
 await t.test('Vencimiento y programación se calculan al consultar sin cron',async()=>{
  await access.update({vence_en:new Date(now-1),inicio_en:new Date(now-86400000)});assert.equal((await get('?curso_id='+course.id)).body.data[0].estado_temporal,'VENCIDO');assert.equal((await get('?vencimiento=7')).body.meta.total,0);
  await access.update({inicio_en:new Date(now+86400000),vence_en:new Date(now+3*86400000)});assert.equal((await get('?curso_id='+course.id)).body.data[0].estado_temporal,'PROGRAMADO');assert.equal((await get('?vencimiento=7')).body.meta.total,0);
 });
 await t.test('Filtros e IDs estrictos, 404 e inexistentes; consultar no audita ni escribe',async()=>{
  for(const query of ['?rol=ADMIN','?curso_id=1 OR 1=1','?avance=LIBRE','?vencimiento=8','?por_pagina=501','?pagina=0','?ordenar_por=password_hash','?q=%00'])assert.equal((await get(query)).status,422,query);
  assert.equal((await get('/'+access.id+'?estado_progreso=LIBRE')).status,422);assert.equal((await get('/999999')).status,404);assert.equal((await get('/18446744073709551615')).status,404);assert.equal((await get('/18446744073709551616')).status,422);
  const audits=await modelos.auditoria_eventos.count();await get('');await get('/'+access.id);assert.equal(await modelos.auditoria_eventos.count(),audits);
 });
});
