import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,access,unlink,symlink,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import db from '../src/DataBase/db.js';
import { modelos as m } from '../src/Models/index.js';
import * as Comercios from '../src/Controllers/Comercio/CTS_TB_ComerciosAmigos.js';
import { reintentarEliminaciones } from '../src/Services/Archivo/archivoReferencias.service.js';
import { conectarPrueba } from './adapter-crm.js';
test('Logos: referencias privadas, auditoría y borrado físico con SQLite aislado',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'factore-logo-')),previous=process.env.STORAGE_ROOT;process.env.STORAGE_ROOT=root;await mkdir(path.join(root,'imagenes'));await mkdir(path.join(root,'videos'));
 const adapter=await conectarPrueba(db,{fixture:'campus.sqlite.sql'});t.after(async()=>{await adapter.close();await rm(root,{recursive:true,force:true});if(previous===undefined)delete process.env.STORAGE_ROOT;else process.env.STORAGE_ROOT=previous;});
 const admin=await m.usuarios.create({nombre:'Admin',email:'logo-admin@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:'PRUEBA'}),client=await m.crm_clientes.create({nombre:'Cliente'}),student=await m.usuarios.create({nombre:'Alumno',email:'logo-alumno@example.invalid',rol:'ALUMNO',estado:'ACTIVO',cliente_id:client.id,password_hash:'PRUEBA'});
 const a=await m.comercios_amigos.create({nombre:'Comercio A',slug:'comercio-a',mostrar_a_usuarios:1}),b=await m.comercios_amigos.create({nombre:'Comercio B',slug:'comercio-b'});
 async function image(tipo='IMAGEN'){const uuid=randomUUID(),folder=tipo==='IMAGEN'?'imagenes':'videos',relative=folder+'/'+uuid+'.'+(tipo==='IMAGEN'?'png':'mp4');await writeFile(path.join(root,relative),'imagen privada');return m.archivos.create({uuid,tipo,nombre_original:uuid+'.png',nombre_guardado:path.basename(relative),ruta_relativa:relative,mime_type:tipo==='IMAGEN'?'image/png':'video/mp4',extension:tipo==='IMAGEN'?'png':'mp4',tamanio_bytes:'14',estado:'DISPONIBLE',subido_por:admin.id});}
 async function call(body,id=a.id,user={id:admin.id},handler=Comercios.UR_LogoComercioAmigo_CTS){const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.value=JSON.parse(JSON.stringify(value));return this;}};await handler({user,params:{id:String(id)},body},res);return res;}
 const ok=(res,status=200)=>{assert.equal(res.statusCode,status,JSON.stringify(res.value));return res.value;};let shared,replacement;
 await t.test('Sesión y rol obligatorio; campos reservados y cuerpos exactos',async()=>{
   ok(await call({logo_archivo_id:null},a.id,null),401);ok(await call({logo_archivo_id:null},a.id,{id:student.id,rol:'ADMIN'}),403);
   for(const body of [{},{logo_archivo_id:'01'},{logo_archivo_id:9007199254740992},{logo_archivo_id:null,nombre:'Otro'}])ok(await call(body),422);
   ok(await call({logo_archivo_id:null},'18446744073709551615'),404);ok(await call({logo_archivo_id:null},a.id,undefined,Comercios.UR_ComercioAmigo_CTS),422);
 });
 await t.test('Asociar imagen física disponible audita sin rutas privadas ni cambio de visibilidad',async()=>{
   shared=await image();const result=ok(await call({logo_archivo_id:shared.id}));assert.equal(result.data.logo_archivo_id,String(shared.id));assert.equal(result.data.mostrar_a_usuarios,1);assert.ok(!JSON.stringify(result).includes('ruta_relativa'));await access(path.join(root,shared.ruta_relativa));assert.equal(await m.auditoria_eventos.count({where:{accion:'COMERCIO_LOGO_ACTUALIZADO'}}),1);
 });
 await t.test('Rechazar tipo incorrecto, archivo inexistente, pendiente y symlink conserva logo',async()=>{
   const video=await image('VIDEO'),missing=await image(),pending=await image(),link=await image();await unlink(path.join(root,missing.ruta_relativa));await pending.update({estado:'PENDIENTE_ELIMINACION'});await unlink(path.join(root,link.ruta_relativa));await symlink(path.join(root,shared.ruta_relativa),path.join(root,link.ruta_relativa));
   for(const file of [video,missing,pending,link])ok(await call({logo_archivo_id:file.id}),422);assert.equal((await m.comercios_amigos.findByPk(a.id)).logo_archivo_id,String(shared.id));
 });
 await t.test('Reemplazar logo compartido conserva disco; retirar última referencia confirma borrado',async()=>{
   ok(await call({logo_archivo_id:shared.id},b.id));replacement=await image();ok(await call({logo_archivo_id:replacement.id}));await access(path.join(root,shared.ruta_relativa));const removed=ok(await call({logo_archivo_id:null},b.id));assert.equal(removed.eliminaciones[0].estado,'COMPLETADA');assert.equal((await m.archivos.findByPk(shared.id)).estado,'ELIMINADO');await assert.rejects(access(path.join(root,shared.ruta_relativa)));
 });
 await t.test('Referencia desde un curso también conserva el logo retirado',async()=>{
   const course=await m.cursos.create({titulo:'Curso',slug:'curso',creado_por:admin.id,portada_archivo_id:replacement.id});ok(await call({logo_archivo_id:null}));await access(path.join(root,replacement.ruta_relativa));assert.equal((await m.archivos.findByPk(replacement.id)).estado,'DISPONIBLE');await course.update({portada_archivo_id:null});
 });
 await t.test('Desactivar no borra logo; reactivar conserva archivo y clientes',async()=>{
   ok(await call({logo_archivo_id:replacement.id}));await m.comercio_clientes.create({comercio_id:a.id,cliente_id:client.id});ok(await call({},a.id,undefined,Comercios.ER_ComercioAmigo_CTS));assert.equal((await m.comercios_amigos.findByPk(a.id)).logo_archivo_id,String(replacement.id));await access(path.join(root,replacement.ruta_relativa));ok(await call({activo:1},a.id,undefined,Comercios.UR_ComercioAmigo_CTS));assert.equal(await m.comercio_clientes.count({where:{comercio_id:a.id}}),1);
 });
 await t.test('Fallo de auditoría revierte asociación y no elimina el logo anterior',async()=>{
   const newLogo=await image(),create=m.auditoria_eventos.create;m.auditoria_eventos.create=async()=>{throw new Error('SQL privado');};try{const res=ok(await call({logo_archivo_id:newLogo.id}),500);assert.ok(!JSON.stringify(res).includes('SQL privado'));}finally{m.auditoria_eventos.create=create;}
   assert.equal((await m.comercios_amigos.findByPk(a.id)).logo_archivo_id,String(replacement.id));await access(path.join(root,replacement.ruta_relativa));await access(path.join(root,newLogo.ruta_relativa));
 });
 await t.test('Borrado fallido informa 202, no sigue symlink y cola permite reintento',async()=>{
   const victim=await image(),external=path.join(root,'conservar.png');await writeFile(external,'conservar');ok(await call({logo_archivo_id:victim.id}));await unlink(path.join(root,victim.ruta_relativa));await symlink(external,path.join(root,victim.ruta_relativa));const result=ok(await call({logo_archivo_id:null}),202);assert.equal(result.eliminaciones[0].estado,'ERROR');assert.equal((await m.archivos.findByPk(victim.id)).estado,'PENDIENTE_ELIMINACION');await access(external);await unlink(path.join(root,victim.ruta_relativa));await m.archivos_eliminaciones.update({proximo_intento_en:null},{where:{archivo_id:victim.id}});await reintentarEliminaciones();assert.equal((await m.archivos.findByPk(victim.id)).estado,'ELIMINADO');await access(external);
 });
});
