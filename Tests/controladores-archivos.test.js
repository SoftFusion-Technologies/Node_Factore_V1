import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer,request } from 'node:http';
import { once } from 'node:events';
import { mkdtemp,readFile,readdir,stat,access,unlink,symlink,writeFile,utimes,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import * as Archivos from '../src/Controllers/Archivo/CTS_TB_Archivos.js';
import * as Cursos from '../src/Controllers/Curso/CTS_TB_Cursos.js';
import { recuperarSubidas } from '../src/Services/Archivo/recuperacionArchivo.service.js';
import { rangoBytes } from '../src/Services/Archivo/contenidoArchivo.service.js';
import { inicializarStorage } from '../src/Services/Archivo/rutasArchivo.service.js';
import { conectarPrueba } from './adapter-crm.js';

const pdf=Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(12)]);
function multipart(parts) {
  const boundary='factore-'+randomUUID(),chunks=[];
  for(const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.field??'archivo'}"${part.name===undefined?'':`; filename="${part.name}"`}\r\n${part.name===undefined?'':`Content-Type: ${part.mime??'application/octet-stream'}\r\n`}\r\n`),part.bytes??Buffer.from('valor'),Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {body:Buffer.concat(chunks),headers:{'content-type':`multipart/form-data; boundary=${boundary}`}};
}
test('Archivos: multipart HTTP real, SQLite aislado y almacenamiento temporal privado',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'factore-archivos-'));const env={};
  for(const key of ['STORAGE_ROOT','MAX_VIDEO_BYTES','MAX_IMAGE_BYTES','MAX_DOCUMENT_BYTES','UPLOAD_TIMEOUT_MS']) env[key]=process.env[key];
  process.env.STORAGE_ROOT=root;
  const adapter=await conectarPrueba(db,{fixture:'contenido.sqlite.sql'});
  const admin=await modelos.usuarios.create({nombre:'Admin',email:'admin@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:'HASH_PRIVADO'});
  const cliente=await modelos.crm_clientes.create({nombre:'Alumno cliente'});
  const alumno=await modelos.usuarios.create({nombre:'Alumno',email:'alumno@example.invalid',rol:'ALUMNO',estado:'ACTIVO',cliente_id:cliente.id});
  const blocked=await modelos.usuarios.create({nombre:'Bloqueado',email:'bloqueado@example.invalid',rol:'ADMIN',estado:'BLOQUEADO'});
  let calls=0;const ended=new Set();
  const server=createServer(async(req,res)=>{
    // Inyección exclusivamente de prueba: este servidor NO se entrega como autenticación.
    const callId=++calls;res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
    const url=new URL(req.url,'http://test');req.query=Object.fromEntries(url.searchParams);req.params={};
    req.user=req.headers['x-test-user']?{id:req.headers['x-test-user']}:null;
    const match=/^\/files(?:\/([^/]+))?(?:\/(content|refs|duration))?$/.exec(url.pathname);
    if(!match){res.status(404).end();return;}
    req.params=req.method==='POST'?{tipo:match[1]}:{id:match[1]};
    try {
      let handler;
      if(req.method==='POST') handler=Archivos.CR_Archivo_CTS;
      else if(match[2]==='content') handler=Archivos.OBRS_ContenidoArchivo_CTS;
      else if(match[2]==='refs') handler=Archivos.OBRS_ReferenciasArchivo_CTS;
      else if(req.method==='PATCH') {
        const chunks=[];for await(const chunk of req) chunks.push(chunk);req.body=JSON.parse(Buffer.concat(chunks).toString());handler=Archivos.UR_DuracionArchivo_CTS;
      } else if(req.method==='DELETE') handler=Archivos.ER_Archivo_CTS;
      else handler=match[1]?Archivos.OBRS_DetArchivo_CTS:Archivos.OBRS_Archivos_CTS;
      await handler(req,res);
    } catch(error){if(!res.headersSent) res.status(500).json({error:error.name});else res.destroy();}
    finally {ended.add(callId);server.emit('call-end',callId);}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await adapter.close();await rm(root,{recursive:true,force:true});
    for(const [key,value] of Object.entries(env)) if(value===undefined) delete process.env[key];else process.env[key]=value;
  });
  async function send(url,options={}) {return fetch(base+url,{...options,headers:{'x-test-user':String(admin.id),...options.headers}});}
  async function json(url,options={},expected=200) {const res=await send(url,options),value=await res.json();assert.equal(res.status,expected,JSON.stringify(value));return value;}
  async function upload(tipo,name,bytes,mime='application/octet-stream',expected=201) {return json(`/files/${tipo}`,{method:'POST',...multipart([{name,bytes,mime}])},expected);}
  const files=[];
  await t.test('Sin sesión, alumno y administrador bloqueado no pueden subir o leer',async()=>{
    for(const [user,expected] of [[undefined,401],[alumno.id,403],[blocked.id,401]]) {
      await json('/files',{headers:{'x-test-user':user===undefined?'':String(user)}},expected);
      await json('/files/VIDEO',{method:'POST',...multipart([{name:'video.mp4',bytes:mp4}]),headers:{...multipart([]).headers,'x-test-user':user===undefined?'':String(user)}},expected);
    }
    assert.equal(await modelos.archivos.count(),0);
  });
  await t.test('Subida PDF, imagen y video: disco privado, metadatos y SHA256 internos',async()=>{
    for(const [tipo,name,bytes,mime] of [['DOCUMENTO','Guía de Juan.pdf',pdf,'application/pdf'],['IMAGEN','Portada.png',png,'image/png'],['VIDEO','Lección.mp4',mp4,'video/mp4']]) {
      const response=await upload(tipo,name,bytes,mime),publicFile=response.data;files.push(publicFile);
      assert.equal(publicFile.tipo,tipo);assert.equal(publicFile.estado,'DISPONIBLE');assert.equal(publicFile.nombre_original,name);
      assert.equal(publicFile.tamanio_bytes,String(bytes.length));assert.equal(publicFile.subido_por,String(admin.id));
      for(const privateField of ['ruta_relativa','nombre_guardado','sha256','password_hash']) assert.ok(!Object.hasOwn(publicFile,privateField),privateField);
      const stored=await modelos.archivos.findByPk(publicFile.id);assert.equal(stored.sha256,createHash('sha256').update(bytes).digest('hex'));
      assert.deepEqual(await readFile(path.join(root,stored.ruta_relativa)),bytes);assert.equal((await stat(path.join(root,stored.ruta_relativa))).mode&0o777,0o600);
    }
    assert.deepEqual(await readdir(path.join(root,'.tmp')),[]);
    assert.equal(await modelos.auditoria_eventos.count({where:{accion:'ARCHIVO_SUBIDO'}}),3);
  });
  await t.test('Documento Office admite estructura propia y rechaza ZIP genérico o macro',async()=>{
    for(const extension of ['docx','xlsx']) {
      const bytes=await readFile(new URL(`./fixtures/valido.${extension}`,import.meta.url));
      files.push((await upload('DOCUMENTO',`guia.${extension}`,bytes)).data);
    }
    const generic=await readFile(new URL('./fixtures/generico.zip',import.meta.url));
    await upload('DOCUMENTO','falso.docx',generic,'application/octet-stream',422);
    await upload('DOCUMENTO','falso.xlsx',generic,'application/octet-stream',422);
    await upload('DOCUMENTO','macro.docx',await readFile(new URL('./fixtures/macro.docx',import.meta.url)),'application/octet-stream',422);
  });
  await t.test('MIME, extensión, firma, archivo vacío y campos extra se rechazan sin residuos',async()=>{
    const before=await modelos.archivos.count();
    for(const [tipo,name,bytes,mime] of [['VIDEO','peligroso.html',mp4,'text/html'],['IMAGEN','falso.png',pdf,'image/png'],
      ['VIDEO','falso.mp4',mp4,'image/png'],['DOCUMENTO','vacio.pdf',Buffer.alloc(0),'application/pdf'],['constructor','x.mp4',mp4,'video/mp4']])
      await upload(tipo,name,bytes,mime,422);
    await json('/files/DOCUMENTO',{method:'POST',...multipart([{field:'otro',name:'guia.pdf',bytes:pdf}])},422);
    await json('/files/DOCUMENTO',{method:'POST',...multipart([{name:'uno.pdf',bytes:pdf},{name:'dos.pdf',bytes:pdf}])},422);
    await json('/files/DOCUMENTO',{method:'POST',...multipart([{name:'uno.pdf',bytes:pdf},{field:'subido_por',bytes:Buffer.from('999')}])},422);
    await json('/files/DOCUMENTO',{method:'POST',...multipart([])},422);
    await json('/files/DOCUMENTO',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},415);
    await json('/files/DOCUMENTO',{method:'POST',headers:{'content-type':'multipart/form-data'},body:'abc'},422);
    const incomplete=multipart([{name:'guia.pdf',bytes:pdf}]);incomplete.body=incomplete.body.subarray(0,incomplete.body.length-15);
    await json('/files/DOCUMENTO',{method:'POST',...incomplete},422);
    assert.equal(await modelos.archivos.count(),before);assert.deepEqual(await readdir(path.join(root,'.tmp')),[]);
  });
  await t.test('Límite configurable acepta tamaño exacto y rechaza el byte siguiente',async()=>{
    process.env.MAX_DOCUMENT_BYTES=String(pdf.length);
    files.push((await upload('DOCUMENTO','exacto.pdf',pdf)).data);
    await upload('DOCUMENTO','grande.pdf',Buffer.concat([pdf,Buffer.from('x')]),'application/octet-stream',413);
    delete process.env.MAX_DOCUMENT_BYTES;assert.deepEqual(await readdir(path.join(root,'.tmp')),[]);
  });
  await t.test('Listados completos, filtros y detalle no muestran rutas o hashes',async()=>{
    const seed=await modelos.archivos.findByPk(files[0].id);
    for(let n=0;n<106;n++) {
      const uuid=randomUUID();await modelos.archivos.create({...seed.get({plain:true}),id:undefined,uuid,nombre_guardado:`${uuid}.pdf`,ruta_relativa:`documentos/${uuid}.pdf`,nombre_original:`Semilla ${n}.pdf`});
    }
    const all=await json('/files');assert.equal(all.data.length,112);assert.equal(all.meta.paginado,false);
    assert.ok(!JSON.stringify(all).includes('ruta_relativa'));assert.ok(!JSON.stringify(all).includes('sha256'));
    assert.equal((await json('/files?tipo=VIDEO')).data.length,1);
    const page=await json('/files?pagina=2&por_pagina=10');assert.equal(page.data.length,10);assert.equal(page.meta.total,112);
    assert.equal((await json('/files/'+files[0].id)).data.nombre_original,'Guía de Juan.pdf');
    await json('/files?ordenar_por=ruta_relativa',{},422);await json('/files/999999',{},404);
  });
  await t.test('Lectura administrativa, HEAD y rangos HTTP devuelven bytes correctos',async()=>{
    const file=files.find(row=>row.tipo==='VIDEO'),url=`/files/${file.id}/content`;
    const full=await send(url);assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),mp4);
    assert.equal(full.headers.get('cache-control'),'private, no-store');assert.equal(full.headers.get('x-content-type-options'),'nosniff');
    const head=await send(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(mp4.length));assert.equal((await head.arrayBuffer()).byteLength,0);
    for(const [range,start,end] of [['bytes=0-3',0,3],['bytes=4-',4,mp4.length-1],['bytes=-4',mp4.length-4,mp4.length-1],['bytes=0-99999999999999999999999',0,mp4.length-1]]) {
      const res=await send(url,{headers:{range}});assert.equal(res.status,206);assert.deepEqual(Buffer.from(await res.arrayBuffer()),mp4.subarray(start,end+1));
      assert.equal(res.headers.get('content-range'),`bytes ${start}-${end}/${mp4.length}`);
    }
    for(const range of ['bytes=999999-','bytes=5-4','bytes=-0','bytes=0-1,3-4','items=0-4']) {
      const res=await send(url,{headers:{range}});assert.equal(res.status,416);assert.equal(res.headers.get('content-range'),`bytes */${mp4.length}`);await res.arrayBuffer();
    }
    await json(url,{headers:{'x-test-user':String(alumno.id)}},403);
    const document=await send(`/files/${files[0].id}/content`);assert.match(document.headers.get('content-disposition'),/^attachment/);await document.arrayBuffer();
    assert.equal(rangoBytes('bytes=-9999999999999999999',24).start,0);
  });
  await t.test('Duración solo en videos, con validación y auditoría',async()=>{
    const video=files.find(row=>row.tipo==='VIDEO');
    const edited=await json(`/files/${video.id}/duration`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({duracion_segundos:90})});assert.equal(edited.data.duracion_segundos,90);
    await json(`/files/${files[0].id}/duration`,{method:'PATCH',body:JSON.stringify({duracion_segundos:1})},409);
    for(const body of [{duracion_segundos:0},{duracion_segundos:1,ruta_relativa:'x'},{duracion_segundos:4294967296}])
      await json(`/files/${video.id}/duration`,{method:'PATCH',body:JSON.stringify(body)},422);
  });
  await t.test('Archivo en uso se conserva; quitar asociación permite eliminar físicamente',async()=>{
    const image=files.find(row=>row.tipo==='IMAGEN');
    const curso=await modelos.cursos.create({titulo:'Curso',slug:'curso',creado_por:admin.id,portada_archivo_id:image.id});
    const refs=await json(`/files/${image.id}/refs`);assert.equal(refs.data.total,1);assert.equal(refs.data.referencias.cursos_portada,1);
    await json('/files/'+image.id,{method:'DELETE'},409);
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.value=value;return this;}};
    await Cursos.UR_Curso_CTS({user:{id:admin.id},params:{id:curso.id},body:{portada_archivo_id:null}},res);assert.equal(res.statusCode,200);
    const stored=await modelos.archivos.findByPk(image.id);assert.equal(stored.estado,'ELIMINADO');await assert.rejects(access(path.join(root,stored.ruta_relativa)),{code:'ENOENT'});
    await json('/files/'+image.id,{method:'DELETE'});await json(`/files/${image.id}/content`,{},404);
    const spare=(await upload('DOCUMENTO','sobrante.pdf',pdf)).data;await json('/files/'+spare.id,{method:'DELETE'});
    assert.equal((await modelos.archivos.findByPk(spare.id)).estado,'ELIMINADO');
  });
  await t.test('Archivo físico alterado o symlink no se sirve y borrado queda pendiente',async()=>{
    const file=(await upload('DOCUMENTO','cambiar.pdf',pdf)).data,stored=await modelos.archivos.findByPk(file.id),full=path.join(root,stored.ruta_relativa);
    await writeFile(full,'contenido alterado');await json(`/files/${file.id}/content`,{},409);
    const outside=path.join(root,'afuera.pdf');await writeFile(outside,pdf);await unlink(full);await symlink(outside,full);
    await json(`/files/${file.id}/content`,{},404);const result=await json('/files/'+file.id,{method:'DELETE'},202);
    assert.equal(result.eliminaciones[0].estado,'ERROR');await access(outside);await unlink(full);await writeFile(full,pdf);
    await json('/files/'+file.id,{method:'DELETE'});await access(outside);
  });
  await t.test('Error de auditoría antes/después del destino limpia temporales y confirma descarte',async()=>{
    const before=await modelos.archivos.count();const logs=[];const original=console.error;console.error=value=>logs.push(String(value));
    try {
      modelos.auditoria_eventos.addHook('beforeCreate','fallo',row=>{if(row.accion==='ARCHIVO_CARGA_PREPARADA') throw new Error('secreto');});
      await upload('DOCUMENTO','fallo.pdf',pdf,'application/octet-stream',500);assert.equal(await modelos.archivos.count(),before);
      modelos.auditoria_eventos.removeHook('beforeCreate','fallo');
      modelos.auditoria_eventos.addHook('beforeCreate','fallo',row=>{if(row.accion==='ARCHIVO_SUBIDO') throw new Error('secreto');});
      await upload('DOCUMENTO','fallo-destino.pdf',pdf,'application/octet-stream',500);
      const stored=await modelos.archivos.findOne({where:{nombre_original:'fallo-destino.pdf'}});assert.equal(stored.estado,'ELIMINADO');
      await assert.rejects(access(path.join(root,stored.ruta_relativa)),{code:'ENOENT'});assert.deepEqual(await readdir(path.join(root,'.tmp')),[]);
      assert.ok(!logs.join('').includes('secreto'));
    } finally {console.error=original;modelos.auditoria_eventos.removeHook('beforeCreate','fallo');}
  });
  await t.test('Recuperar carga abandonada conserva las recientes y limpia temporal antiguo',async()=>{
    const old=new Date(Date.now()-25*60*60000),uuid=randomUUID(),recentUuid=randomUUID();
    const baseData={tipo:'DOCUMENTO',nombre_original:'abandonado.pdf',mime_type:'application/pdf',extension:'pdf',tamanio_bytes:String(pdf.length),estado:'SUBIENDO',subido_por:admin.id};
    const file=await modelos.archivos.create({...baseData,uuid,nombre_guardado:`${uuid}.pdf`,ruta_relativa:`documentos/${uuid}.pdf`,creado_en:old});
    const recent=await modelos.archivos.create({...baseData,uuid:recentUuid,nombre_guardado:`${recentUuid}.pdf`,ruta_relativa:`documentos/${recentUuid}.pdf`});
    await writeFile(path.join(root,file.ruta_relativa),pdf);const temp=path.join(root,'.tmp',`${uuid}.part`);await writeFile(temp,pdf);await utimes(temp,old,old);
    const result=await recuperarSubidas();assert.equal(result.temporales_eliminados,1);assert.ok(result.eliminaciones.some(row=>row.estado==='COMPLETADA'));
    assert.equal((await file.reload()).estado,'ELIMINADO');assert.equal((await recent.reload()).estado,'SUBIENDO');
    await assert.rejects(access(temp),{code:'ENOENT'});await json('/files/'+recent.id,{method:'DELETE'},409);
  });
  await t.test('Carga abortada al llegar o mientras escribe limpia temporal sin insertar metadatos',{timeout:5000},async()=>{
    const before=await modelos.archivos.count();
    for(const writing of [false,true]) {
      const boundary='abort-'+randomUUID(),callId=calls+1;
      const req=request(base+'/files/VIDEO',{method:'POST',headers:{'x-test-user':String(admin.id),'content-type':`multipart/form-data; boundary=${boundary}`}});
      req.on('error',()=>{});req.write(`--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);req.write(mp4);req.write(Buffer.alloc(65536));
      await new Promise(resolve=>{
        const timer=setInterval(async()=>{
          const ready=writing?(await readdir(path.join(root,'.tmp'))).length>0:calls>=callId;
          if(ready){clearInterval(timer);resolve();}
        },5);
      });
      req.destroy();if(!ended.has(callId)) await once(server,'call-end');
      assert.equal(await modelos.archivos.count(),before);assert.deepEqual(await readdir(path.join(root,'.tmp')),[]);
    }
  });
  await t.test('Cuenta bloqueada entre preparar y confirmar impide publicación y permite limpieza',async()=>{
    const original=console.error;console.error=()=>{};
    modelos.auditoria_eventos.addHook('beforeCreate','bloqueo',async(row,options)=>{
      if(row.accion==='ARCHIVO_CARGA_PREPARADA') await modelos.usuarios.update({estado:'BLOQUEADO'},{where:{id:admin.id},transaction:options.transaction});
    });
    try {
      await upload('DOCUMENTO','bloqueo-durante-carga.pdf',pdf,'application/octet-stream',401);
      const file=await modelos.archivos.findOne({where:{nombre_original:'bloqueo-durante-carga.pdf'}});assert.equal(file.estado,'ELIMINADO');
      await assert.rejects(access(path.join(root,file.ruta_relativa)),{code:'ENOENT'});assert.deepEqual(await readdir(path.join(root,'.tmp')),[]);
    } finally {console.error=original;modelos.auditoria_eventos.removeHook('beforeCreate','bloqueo');await modelos.usuarios.update({estado:'ACTIVO'},{where:{id:admin.id}});}
  });
  await t.test('Carpeta symlink se rechaza sin seguir su destino',async()=>{
    const other=await mkdtemp(path.join(tmpdir(),'factore-afuera-'));const directory=path.join(root,'.tmp');
    await rm(directory,{recursive:true});await symlink(other,directory);
    await assert.rejects(inicializarStorage(),error=>error.code==='ARCHIVO_RUTA');
    assert.deepEqual(await readdir(other),[]);await unlink(directory);await rm(other,{recursive:true});await inicializarStorage();
  });
});
