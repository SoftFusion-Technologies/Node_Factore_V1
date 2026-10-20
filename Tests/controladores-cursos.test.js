import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, unlink, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import * as Cursos from '../src/Controllers/Curso/CTS_TB_Cursos.js';
import * as Modulos from '../src/Controllers/Curso/CTS_TB_CursoModulos.js';
import * as Lecciones from '../src/Controllers/Curso/CTS_TB_CursoLecciones.js';
import * as Materiales from '../src/Controllers/Curso/CTS_TB_CursoMateriales.js';
import { referenciasArchivo, reintentarEliminaciones, procesarEliminacion } from '../src/Services/Archivo/archivoReferencias.service.js';
import { conectarPrueba } from './adapter-crm.js';

test('Contenido: Sequelize/MySQL con SQLite aislado y archivos físicos temporales',async t => {
  const root = await mkdtemp(path.join(tmpdir(),'factore-contenido-'));
  const previous = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = root;
  for (const folder of ['videos','imagenes','documentos']) await mkdir(path.join(root,folder));
  const adapter = await conectarPrueba(db,{fixture:'contenido.sqlite.sql'});
  t.after(async () => {
    await adapter.close(); await rm(root,{recursive:true,force:true});
    if (previous === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = previous;
  });
  const admin = await modelos.usuarios.create({nombre:'Admin',email:'admin@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:'HASH_PRIVADO'});
  const cliente = await modelos.crm_clientes.create({nombre:'Alumno cliente'});
  const student = await modelos.usuarios.create({nombre:'Alumno',email:'alumno@example.invalid',rol:'ALUMNO',estado:'ACTIVO',cliente_id:cliente.id,password_hash:'HASH_PRIVADO'});
  async function call(handler,{user={id:admin.id},params={},query={},body} = {}) {
    const res = {statusCode:200,value:null,status(code) {this.statusCode=code;return this;},json(value) {this.value=JSON.parse(JSON.stringify(value));return this;}};
    await handler({user,params,query,body},res); return res;
  }
  function ok(res,status=200) {assert.equal(res.statusCode,status,JSON.stringify(res.value));return res.value.data;}
  async function archivo(tipo,overrides = {}) {
    const uuid=randomUUID(),folder={VIDEO:'videos',IMAGEN:'imagenes',DOCUMENTO:'documentos'}[tipo];
    const extension={VIDEO:'mp4',IMAGEN:'png',DOCUMENTO:'pdf'}[tipo];
    const ruta=`${folder}/${uuid}.${extension}`;
    await writeFile(path.join(root,ruta),'archivo temporal privado');
    const row=await modelos.archivos.create({uuid,tipo,nombre_original:`prueba.${extension}`,nombre_guardado:`${uuid}.${extension}`,
      ruta_relativa:ruta,mime_type:{VIDEO:'video/mp4',IMAGEN:'image/png',DOCUMENTO:'application/pdf'}[tipo],extension,
      tamanio_bytes:'24',estado:'DISPONIBLE',subido_por:admin.id,...overrides});
    return row;
  }
  let curso,otroCurso,modulo,otroModulo,leccion,otraLeccion,video,portada,material,documento;
  await t.test('Administración obligatoria y entradas protegidas',async () => {
    ok(await call(Cursos.OBRS_Cursos_CTS,{user:null}),401);
    ok(await call(Cursos.CR_Curso_CTS,{user:{id:student.id,rol:'ADMIN'},body:{titulo:'Privado'}}),403);
    for (const body of [{titulo:''},{titulo:'X',creado_por:student.id},{titulo:'X',precio:'-1'},
      {titulo:'X',precio:'100.001'},{titulo:'X',precio:'1000000000000'},{titulo:'X',moneda:'A'},
      {titulo:'X',visible_catalogo:'true'},{titulo:'X',estado:'PUBLICADO'}]) ok(await call(Cursos.CR_Curso_CTS,{body}),422);
    ok(await call(Cursos.OBRS_DetCurso_CTS,{params:{id:'1 OR 1=1'}}),422);
    ok(await call(Cursos.OBRS_DetCurso_CTS,{params:{id:'18446744073709551615'}}),404);
  });
  await t.test('Curso borrador, precio exacto, portada privada y edición parcial',async () => {
    portada=await archivo('IMAGEN'); video=await archivo('VIDEO'); documento=await archivo('DOCUMENTO');
    curso=ok(await call(Cursos.CR_Curso_CTS,{body:{titulo:'Factor E: Gestión',precio:'123456789012.34',moneda:'ars',portada_archivo_id:portada.id}}),201);
    assert.equal(curso.estado,'BORRADOR');assert.equal(curso.precio,'123456789012.34');assert.equal(curso.moneda,'ARS');
    assert.equal(curso.creado_por,String(admin.id));assert.match(curso.creado_en,/Z$/);
    const detail=ok(await call(Cursos.OBRS_DetCurso_CTS,{params:{id:curso.id}}));
    assert.equal(detail.portada.tipo,'IMAGEN');assert.ok(!JSON.stringify(detail).includes('ruta_relativa'));
    assert.ok(!JSON.stringify(detail).includes('nombre_guardado'));
    ok(await call(Cursos.CR_Curso_CTS,{body:{titulo:'Otro',slug:curso.slug}}),409);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{precio:null,descripcion_corta:'Descripción'}}));
    const unchanged=await modelos.cursos.findByPk(curso.id);assert.equal(unchanged.titulo,curso.titulo);assert.equal(unchanged.precio,null);
    otroCurso=ok(await call(Cursos.CR_Curso_CTS,{body:{titulo:'Otro curso'}}),201);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{estado:'PUBLICADO'}}),422);
  });
  await t.test('Listados completos, filtros, búsqueda y paginación sin corte implícito',async () => {
    for (let n=0;n<109;n++) await modelos.cursos.create({titulo:`Curso ${n}`,slug:`curso-${n}`,creado_por:admin.id});
    const all=await call(Cursos.OBRS_Cursos_CTS);assert.equal(ok(all).length,111);assert.equal(all.value.meta.paginado,false);
    assert.equal(ok(await call(Cursos.OBRS_Cursos_CTS,{query:{q:'  '}})).length,111);
    const page=await call(Cursos.OBRS_Cursos_CTS,{query:{pagina:'2',por_pagina:'10'}});
    assert.equal(ok(page).length,10);assert.equal(page.value.meta.total,111);
    assert.equal(ok(await call(Cursos.OBRS_Cursos_CTS,{query:{q:"x' OR 1=1 --"}})).length,0);
    for (const query of [{estado:'OTRO'},{limit:'100'},{por_pagina:'501'},{ordenar_por:'ruta_relativa'}]) ok(await call(Cursos.OBRS_Cursos_CTS,{query}),422);
  });
  await t.test('Módulos del curso y aislamiento de contenido',async () => {
    modulo=ok(await call(Modulos.CR_CursoModulo_CTS,{params:{curso_id:curso.id},body:{titulo:'Introducción',orden:1}}),201);
    otroModulo=ok(await call(Modulos.CR_CursoModulo_CTS,{params:{curso_id:otroCurso.id},body:{titulo:'Otro módulo'}}),201);
    assert.equal(ok(await call(Modulos.OBRS_CursoModulos_CTS,{params:{curso_id:curso.id}})).length,1);
    ok(await call(Modulos.OBRS_DetCursoModulo_CTS,{params:{curso_id:otroCurso.id,id:modulo.id}}),404);
    ok(await call(Modulos.UR_CursoModulo_CTS,{params:{curso_id:curso.id,id:modulo.id},body:{curso_id:otroCurso.id}}),422);
    ok(await call(Modulos.UR_CursoModulo_CTS,{params:{curso_id:curso.id,id:modulo.id},body:{descripcion:'💬'.repeat(16000)}}),422);
    const edited=ok(await call(Modulos.UR_CursoModulo_CTS,{params:{curso_id:curso.id,id:modulo.id},body:{descripcion:'Objetivos',orden:2}}));
    assert.equal(edited.titulo,'Introducción');assert.equal(edited.orden,2);
    ok(await call(Lecciones.CR_CursoLeccion_CTS,{params:{curso_id:curso.id},body:{titulo:'Cruce',modulo_id:otroModulo.id}}),422);
  });
  await t.test('Publicación exige video físico disponible del tipo correcto',async () => {
    const base={titulo:'Lección',modulo_id:modulo.id,estado:'PUBLICADA'};
    for (const body of [base,{...base,video_archivo_id:portada.id},{...base,video_archivo_id:'99999'}])
      ok(await call(Lecciones.CR_CursoLeccion_CTS,{params:{curso_id:curso.id},body}),422);
    const missing=await archivo('VIDEO');await unlink(path.join(root,missing.ruta_relativa));
    ok(await call(Lecciones.CR_CursoLeccion_CTS,{params:{curso_id:curso.id},body:{...base,video_archivo_id:missing.id}}),422);
    const pending=await archivo('VIDEO',{estado:'SUBIENDO'});
    ok(await call(Lecciones.CR_CursoLeccion_CTS,{params:{curso_id:curso.id},body:{...base,video_archivo_id:pending.id}}),422);
    leccion=ok(await call(Lecciones.CR_CursoLeccion_CTS,{params:{curso_id:curso.id},body:{...base,video_archivo_id:video.id,portada_archivo_id:portada.id}}),201);
    otraLeccion=ok(await call(Lecciones.CR_CursoLeccion_CTS,{params:{curso_id:curso.id},body:{...base,titulo:'Otra lección',video_archivo_id:video.id}}),201);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{estado:'PUBLICADO',visible_catalogo:true}}));
    const detail=ok(await call(Lecciones.OBRS_DetCursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id}}));
    assert.equal(detail.video.tipo,'VIDEO');assert.equal(detail.modulo.titulo,'Introducción');
    assert.ok(!JSON.stringify(detail).includes('ruta_relativa'));assert.ok(!JSON.stringify(detail).includes('HASH_PRIVADO'));
    assert.equal(ok(await call(Lecciones.OBRS_CursoLecciones_CTS,{params:{curso_id:curso.id},query:{estado:'PUBLICADA',modulo_id:modulo.id}})).length,2);
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:otroCurso.id,id:leccion.id},body:{titulo:'Cruce'}}),404);
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id},body:{modulo_id:otroModulo.id}}),422);
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id},body:{video_archivo_id:null,estado:'PUBLICADA'}}),422);
  });
  await t.test('Preparación de venta: duración editable, precio, publicación y baja automática',async () => {
    let row=await modelos.cursos.findByPk(curso.id);
    assert.equal(row.acceso_duracion_cantidad,1);assert.equal(row.acceso_duracion_unidad,'MESES');assert.equal(row.venta_online_habilitada,0);
    for(const body of [{acceso_duracion_cantidad:0},{acceso_duracion_cantidad:121,acceso_duracion_unidad:'MESES'},
      {acceso_duracion_cantidad:3651,acceso_duracion_unidad:'DIAS'},{acceso_duracion_unidad:'HORAS'},
      {venta_online_habilitada:1,precio:null},{venta_online_habilitada:1,precio:'0.00'},
      {venta_online_habilitada:1,precio:'220000.00',moneda:'USD'}])ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body}),422);
    ok(await call(Cursos.CR_Curso_CTS,{body:{titulo:'Venta borrador',precio:'220000.00',visible_catalogo:1,venta_online_habilitada:1}}),422);
    const before=await modelos.curso_accesos.count();
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{precio:'220000.00',moneda:'ARS',visible_catalogo:1,venta_online_habilitada:1,acceso_duracion_cantidad:2,acceso_duracion_unidad:'MESES'}}));
    row=await row.reload();assert.equal(row.venta_online_habilitada,1);assert.equal(row.acceso_duracion_cantidad,2);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{acceso_duracion_unidad:'DIAS'}}));
    row=await row.reload();assert.equal(row.acceso_duracion_cantidad,2);assert.equal(row.acceso_duracion_unidad,'DIAS');
    assert.equal(await modelos.curso_accesos.count(),before);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{visible_catalogo:0}}));
    row=await row.reload();assert.equal(row.venta_online_habilitada,0);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{visible_catalogo:1}}));
  });
  await t.test('Archivar conserva archivos, asignación y progreso; reactivar recupera contenido',async () => {
    const acceso=await modelos.curso_accesos.create({usuario_id:student.id,curso_id:curso.id,asignado_por:admin.id});
    const progress=await modelos.leccion_progreso.create({usuario_id:student.id,curso_id:curso.id,leccion_id:leccion.id,posicion_segundos:45});
    ok(await call(Modulos.ER_CursoModulo_CTS,{params:{curso_id:curso.id,id:modulo.id}}));
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{estado:'PUBLICADO'}}),422);
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id},body:{estado:'PUBLICADA'}}),409);
    ok(await call(Modulos.UR_CursoModulo_CTS,{params:{curso_id:curso.id,id:modulo.id},body:{estado:'ACTIVO'}}));
    ok(await call(Lecciones.ER_CursoLeccion_CTS,{params:{curso_id:curso.id,id:otraLeccion.id}}));
    assert.equal((await modelos.curso_lecciones.findByPk(otraLeccion.id)).video_archivo_id,String(video.id));
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:otraLeccion.id},body:{estado:'PUBLICADA'}}));
    ok(await call(Cursos.ER_Curso_CTS,{params:{id:curso.id}}));
    assert.equal((await modelos.curso_accesos.findByPk(acceso.id)).estado,'ACTIVO');
    assert.equal((await modelos.leccion_progreso.findByPk(progress.id)).posicion_segundos,45);
    await access(path.join(root,video.ruta_relativa));
    ok(await call(Modulos.CR_CursoModulo_CTS,{params:{curso_id:curso.id},body:{titulo:'Bloqueado'}}),409);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{estado:'PUBLICADO'}}));
  });
  await t.test('Portadas compartidas conservan disco, última referencia elimina con comprobante',async () => {
    const comercio=await modelos.comercios_amigos.create({nombre:'Comercio',slug:'comercio',logo_archivo_id:portada.id});
    const refs=await referenciasArchivo(portada.id);assert.equal(refs.cursos_portada,1);assert.equal(refs.lecciones_portada,1);assert.equal(refs.comercios_logo,1);
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{portada_archivo_id:null}}));
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id},body:{portada_archivo_id:null}}));
    assert.equal((await modelos.archivos.findByPk(portada.id)).estado,'DISPONIBLE');await access(path.join(root,portada.ruta_relativa));
    await comercio.update({logo_archivo_id:null});
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{portada_archivo_id:portada.id}}));
    const result=await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{portada_archivo_id:null}});ok(result);
    assert.equal(result.value.eliminaciones[0].estado,'COMPLETADA');assert.equal((await modelos.archivos.findByPk(portada.id)).estado,'ELIMINADO');
    await assert.rejects(access(path.join(root,portada.ruta_relativa)),{code:'ENOENT'});
    const job=await modelos.archivos_eliminaciones.findOne({where:{archivo_id:portada.id}});assert.ok(job.completada_en);
    assert.equal(await procesarEliminacion(job.id),'COMPLETADA');
  });
  await t.test('Retirar video compartido conserva disco y progreso; última referencia borra',async () => {
    const first=await call(Lecciones.ER_VideoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id}});
    const row=ok(first);assert.equal(row.estado,'BORRADOR');assert.equal(row.video_archivo_id,null);
    assert.equal((await modelos.archivos.findByPk(video.id)).estado,'DISPONIBLE');await access(path.join(root,video.ruta_relativa));
    assert.equal((await modelos.leccion_progreso.findOne({where:{leccion_id:leccion.id}})).posicion_segundos,45);
    const last=await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:otraLeccion.id},body:{video_archivo_id:null}});
    assert.equal(ok(last).estado,'BORRADOR');assert.equal(last.value.eliminaciones[0].estado,'COMPLETADA');
    await assert.rejects(access(path.join(root,video.ruta_relativa)),{code:'ENOENT'});
    ok(await call(Cursos.UR_Curso_CTS,{params:{id:curso.id},body:{estado:'PUBLICADO'}}),422);
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id},body:{video_archivo_id:video.id}}),422);
  });
  await t.test('Material general o por lección, cruces rechazados y reemplazo de documento',async () => {
    const foreign=ok(await call(Lecciones.CR_CursoLeccion_CTS,{params:{curso_id:otroCurso.id},body:{titulo:'Otra',modulo_id:otroModulo.id}}),201);
    ok(await call(Materiales.CR_CursoMaterial_CTS,{params:{curso_id:curso.id},body:{titulo:'Cruce',leccion_id:foreign.id,archivo_id:documento.id}}),422);
    ok(await call(Materiales.CR_CursoMaterial_CTS,{params:{curso_id:curso.id},body:{titulo:'Tipo errado',archivo_id:video.id}}),422);
    material=ok(await call(Materiales.CR_CursoMaterial_CTS,{params:{curso_id:curso.id},body:{titulo:'Guía general',archivo_id:documento.id}}),201);
    const shared=ok(await call(Materiales.CR_CursoMaterial_CTS,{params:{curso_id:curso.id},body:{titulo:'Guía lección',leccion_id:leccion.id,archivo_id:documento.id}}),201);
    assert.equal(ok(await call(Materiales.OBRS_CursoMateriales_CTS,{params:{curso_id:curso.id},query:{generales:'true'}})).length,1);
    assert.equal(ok(await call(Materiales.OBRS_CursoMateriales_CTS,{params:{curso_id:curso.id},query:{leccion_id:leccion.id}})).length,1);
    ok(await call(Materiales.OBRS_DetCursoMaterial_CTS,{params:{curso_id:otroCurso.id,id:material.id}}),404);
    ok(await call(Materiales.UR_CursoMaterial_CTS,{params:{curso_id:curso.id,id:material.id},body:{leccion_id:foreign.id}}),422);
    const replacement=await archivo('DOCUMENTO');
    ok(await call(Materiales.UR_CursoMaterial_CTS,{params:{curso_id:curso.id,id:material.id},body:{archivo_id:replacement.id,activo:false}}));
    await access(path.join(root,documento.ruta_relativa));await access(path.join(root,replacement.ruta_relativa));
    const detail=ok(await call(Materiales.OBRS_DetCursoMaterial_CTS,{params:{curso_id:curso.id,id:material.id}}));assert.equal(detail.archivo.tipo,'DOCUMENTO');
    ok(await call(Materiales.ER_CursoMaterial_CTS,{params:{curso_id:curso.id,id:shared.id}}));
    await assert.rejects(access(path.join(root,documento.ruta_relativa)),{code:'ENOENT'});
    ok(await call(Materiales.ER_CursoMaterial_CTS,{params:{curso_id:curso.id,id:material.id}}));
    await assert.rejects(access(path.join(root,replacement.ruta_relativa)),{code:'ENOENT'});
  });
  await t.test('Borrado fallido deja pendiente, no sigue symlink y se reintenta',async () => {
    const file=await archivo('DOCUMENTO');
    const mat=ok(await call(Materiales.CR_CursoMaterial_CTS,{params:{curso_id:curso.id},body:{titulo:'Reintento',archivo_id:file.id}}),201);
    const outside=path.join(root,'fuera.pdf');await writeFile(outside,'debe conservarse');
    await unlink(path.join(root,file.ruta_relativa));await symlink(outside,path.join(root,file.ruta_relativa));
    const result=await call(Materiales.ER_CursoMaterial_CTS,{params:{curso_id:curso.id,id:mat.id}});ok(result,202);
    assert.equal(result.value.eliminaciones[0].estado,'ERROR');await access(outside);
    const stored=await modelos.archivos.findByPk(file.id);assert.equal(stored.estado,'PENDIENTE_ELIMINACION');assert.equal(stored.eliminado_en,null);
    const job=await modelos.archivos_eliminaciones.findOne({where:{archivo_id:file.id}});assert.equal(job.completada_en,null);
    await unlink(path.join(root,file.ruta_relativa));await writeFile(path.join(root,file.ruta_relativa),'recuperado');
    await job.update({proximo_intento_en:null});
    const retried=await reintentarEliminaciones();assert.equal(retried.find(row=>row.id===String(job.id)).estado,'COMPLETADA');
    assert.equal((await stored.reload()).estado,'ELIMINADO');await access(outside);
  });
  await t.test('Ruta manipulada o archivo symlink no se asocia',async () => {
    const bad=await archivo('VIDEO',{ruta_relativa:'../fuera.mp4'});
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id},body:{video_archivo_id:bad.id}}),422);
    const file=await archivo('VIDEO');const full=path.join(root,file.ruta_relativa);
    await unlink(full);await symlink(path.join(root,'fuera.pdf'),full);
    ok(await call(Lecciones.UR_CursoLeccion_CTS,{params:{curso_id:curso.id,id:leccion.id},body:{video_archivo_id:file.id}}),422);
  });
  await t.test('Interrupción tras unlink recupera trabajo antiguo y confirma ausencia física',async () => {
    const file=await archivo('DOCUMENTO');
    await file.update({estado:'PENDIENTE_ELIMINACION'});
    const job=await modelos.archivos_eliminaciones.create({archivo_id:file.id,solicitado_por:admin.id,estado:'EN_PROCESO',intentos:1});
    await unlink(path.join(root,file.ruta_relativa));
    const originalNow=Date.now;
    Date.now=()=>originalNow()+11*60000;
    try {
      const results=await reintentarEliminaciones();
      assert.equal(results.find(row=>row.id===String(job.id)).estado,'COMPLETADA');
      assert.equal((await file.reload()).estado,'ELIMINADO');assert.equal((await job.reload()).intentos,2);
    } finally {Date.now=originalNow;}
  });
  await t.test('Auditoría fallida revierte referencia y no ejecuta borrado físico',async () => {
    const file=await archivo('DOCUMENTO');
    const mat=ok(await call(Materiales.CR_CursoMaterial_CTS,{params:{curso_id:curso.id},body:{titulo:'Privado',archivo_id:file.id}}),201);
    modelos.auditoria_eventos.addHook('beforeCreate','fallo',()=>{throw new Error('detalle interno');});
    const original=console.error;const logs=[];console.error=value=>logs.push(String(value));
    try {
      const result=await call(Materiales.ER_CursoMaterial_CTS,{params:{curso_id:curso.id,id:mat.id}});ok(result,500);
      assert.ok(!JSON.stringify(result.value).includes('detalle interno'));
      assert.ok(await modelos.curso_materiales.findByPk(mat.id));assert.equal((await modelos.archivos.findByPk(file.id)).estado,'DISPONIBLE');
      assert.equal(await modelos.archivos_eliminaciones.count({where:{archivo_id:file.id}}),0);await access(path.join(root,file.ruta_relativa));
      assert.ok(!logs.join('').includes('detalle interno'));
    } finally {console.error=original;modelos.auditoria_eventos.removeHook('beforeCreate','fallo');}
    assert.ok(adapter.statements.some(sql=>sql.includes('READ COMMITTED')));
    const audit=JSON.stringify(await modelos.auditoria_eventos.findAll());assert.ok(!audit.includes('HASH_PRIVADO'));assert.ok(!audit.includes('ruta_relativa'));
  });
});
