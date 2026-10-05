import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { literal } from 'sequelize';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import * as Auth from '../src/Controllers/Usuario/CTS_Auth.js';
import * as Usuarios from '../src/Controllers/Usuario/CTS_TB_Usuarios.js';
import * as Clientes from '../src/Controllers/Cliente/CTS_TB_Clientes.js';
import * as Security from '../src/Security/auth.js';
import { hashPassword,verificarPassword,hashValido,hashToken,tokenAleatorio } from '../src/utils/password.utils.js';
import { crearPrimerAdmin } from '../src/Services/Usuario/primerAdmin.service.js';
import { configAuth,leerCookie } from '../src/Services/Usuario/configAuth.service.js';
import { cargarSesion } from '../src/Services/Usuario/auth.service.js';
import { conAuditoria } from '../src/Services/Sistema/auditoria.service.js';
import { conectarPrueba } from './adapter-crm.js';

const initialPassword='Primer acceso de Factor E 2026';
const adminPassword='Nueva clave personal de Juan 2026';
const studentPassword='Mi acceso al campus Factor E 2026';
test('Usuarios y auth: cookies HTTP reales, enlaces manuales y SQLite aislado',async t=>{
  const adapter=await conectarPrueba(db,{fixture:'contenido.sqlite.sql'});
  const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
  function caso(name,operation) {clock+=16*60000;return t.test(name,operation);}
  const originalEnv={};for(const key of ['NODE_ENV','COOKIE_SECURE','COOKIE_SAMESITE','SESSION_HOURS','FRONTEND_URL','ALLOWED_ORIGINS']){originalEnv[key]=process.env[key];delete process.env[key];}
  process.env.NODE_ENV='test';
  let server,base,admin,adminJar,student,studentJar,cliente,activation;
  t.after(async()=>{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    Date.now=originalNow;
    for(const [key,value] of Object.entries(originalEnv)) if(value===undefined) delete process.env[key];else process.env[key]=value;
    await adapter.close();
  });
  async function send(url,{jar,body,method=body===undefined?'GET':'POST',headers={}}={}) {
    return fetch(base+url,{method,headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(jar?{cookie:jar.cookie,'x-csrf-token':jar.csrf}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  async function json(url,options={},expected=200) {
    const res=await send(url,options),value=await res.json();assert.equal(res.status,expected,JSON.stringify(value));return {res,value,data:value.data};
  }
  async function login(email,password) {
    const result=await json('/api/auth/login',{body:{email,password}}),header=result.res.headers.get('set-cookie');
    assert.match(header,/factore_sid=[A-Za-z0-9_-]{43}/);assert.ok(!Object.hasOwn(result.data,'raw'));
    return {cookie:header.split(';')[0],csrf:result.data.csrf_token,data:result.data};
  }
  async function adminCall(url,options={},expected=200) {return json('/api/admin'+url,{jar:adminJar,...options},expected);}
  await caso('Primer administrador: hash protegido, cambio obligatorio y bootstrap único',async()=>{
    admin=await crearPrimerAdmin({nombre:'Juan Admin',email:'JUAN@EXAMPLE.INVALID',password:initialPassword});
    assert.equal(admin.email,'juan@example.invalid');assert.equal(admin.cambiar_password,1);assert.ok(!Object.hasOwn(admin,'password_hash'));
    const stored=await modelos.usuarios.scope('conHash').findByPk(admin.id);assert.ok(hashValido(stored.password_hash));assert.ok(await verificarPassword(initialPassword,stored.password_hash));
    assert.ok(!await verificarPassword('otra',stored.password_hash));
    const secondHash=await hashPassword(initialPassword);assert.notEqual(secondHash,stored.password_hash);
    await assert.rejects(crearPrimerAdmin({nombre:'Otro',email:'otro@example.invalid',password:initialPassword}),error=>error.code==='ADMIN_EXISTENTE');
    assert.equal(await modelos.usuarios.count(),1);
    await assert.rejects(hashPassword('123456'),error=>error.code==='PASSWORD_INVALIDO');
  });
  server=createServer(async(req,res)=>{
    res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
    req.ip=req.socket.remoteAddress;const url=new URL(req.url,'http://test');req.query=Object.fromEntries(url.searchParams);req.params={};
    try {
      if(!['GET','HEAD'].includes(req.method)) {const chunks=[];for await(const chunk of req) chunks.push(chunk);const text=Buffer.concat(chunks).toString();req.body=text?JSON.parse(text):{};}
      const auth={
        '/api/auth/login':Auth.LOGIN_CTS,'/api/auth/me':Auth.OBRS_MiPerfil_CTS,'/api/auth/logout':Auth.LOGOUT_CTS,
        '/api/auth/password':Auth.UR_MiPassword_CTS,'/api/auth/activar':Auth.ACTIVAR_Cuenta_CTS,'/api/auth/recuperar':Auth.RECUPERAR_Cuenta_CTS
      };
      if(auth[url.pathname]) return auth[url.pathname](req,res);
      let passed=false;await Security.autenticar(req,res,()=>{passed=true;});if(!passed)return;
      passed=false;await Security.exigirPasswordActualizada(req,res,()=>{passed=true;});if(!passed)return;
      passed=false;await Security.soloAdmin(req,res,()=>{passed=true;});if(!passed)return;
      const match=/^\/api\/admin\/users(?:\/([^/]+))?(?:\/(activar|recuperar|sesiones))?$/.exec(url.pathname);
      if(match) {
        req.params={id:match[1]};let handler;
        if(match[2]==='activar')handler=Usuarios.CR_ActivacionUsuario_CTS;
        else if(match[2]==='recuperar')handler=Usuarios.CR_RecuperacionUsuario_CTS;
        else if(match[2]==='sesiones')handler=Usuarios.ER_SesionesUsuario_CTS;
        else if(req.method==='POST')handler=Usuarios.CR_Usuario_CTS;
        else if(req.method==='PATCH')handler=Usuarios.UR_Usuario_CTS;
        else if(req.method==='DELETE')handler=Usuarios.ER_Usuario_CTS;
        else handler=match[1]?Usuarios.OBRS_DetUsuario_CTS:Usuarios.OBRS_Usuarios_CTS;
        return handler(req,res);
      }
      const clientMatch=/^\/api\/admin\/clients\/([^/]+)$/.exec(url.pathname);
      if(clientMatch){req.params={id:clientMatch[1]};return req.method==='DELETE'?Clientes.ER_Cliente_CTS(req,res):Clientes.UR_Cliente_CTS(req,res);}
      res.status(404).end();
    } catch(error){res.status(500).json({error:error.name});}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
  await caso('Login crea cookie HttpOnly y CSRF; contraseña temporal restringe la gestión',async()=>{
    await json('/api/auth/login',{body:{email:admin.email,password:'incorrecta'}},401);
    await json('/api/auth/login',{body:{email:'nadie@example.invalid',password:'incorrecta'}},401);
    adminJar=await login(admin.email,initialPassword);assert.match(adminJar.cookie,/^factore_sid=/);
    assert.equal(adminJar.data.usuario.cambiar_password,1);
    const profile=await json('/api/auth/me',{jar:adminJar});assert.equal(profile.data.usuario.id,admin.id);assert.equal(profile.res.headers.get('cache-control'),'no-store');
    await adminCall('/users',{},403);
    const changed=await json('/api/auth/password',{jar:adminJar,body:{password_actual:initialPassword,password_nuevo:adminPassword}});
    assert.match(changed.res.headers.get('set-cookie'),/Max-Age=0/);assert.equal(changed.data.iniciar_sesion,true);
    await json('/api/auth/me',{jar:adminJar},401);adminJar=await login(admin.email,adminPassword);
    const session=await modelos.usuarios_sesiones.scope('conHash').findOne({where:{token_hash:hashToken(adminJar.cookie.split('=')[1])}});
    assert.ok(session);assert.notEqual(session.token_hash,adminJar.cookie.split('=')[1]);
    assert.ok(!JSON.stringify(profile.value).includes('password_hash'));
  });
  await caso('Cuentas pendientes requieren cliente activo y rechazan asignación masiva',async()=>{
    cliente=await modelos.crm_clientes.create({nombre:'Cliente sin cursos'});
    student=(await adminCall('/users',{body:{nombre:'Alumno Factor E',email:'ALUMNO@EXAMPLE.INVALID',cliente_id:cliente.id}},201)).data;
    assert.equal(student.estado,'PENDIENTE');assert.equal(student.email,'alumno@example.invalid');
    assert.equal((await modelos.usuarios.scope('conHash').findByPk(student.id)).password_hash,null);
    await adminCall('/users',{body:{nombre:'Duplicado',email:'otro@example.invalid',cliente_id:cliente.id}},409);
    const inactive=await modelos.crm_clientes.create({nombre:'Inactivo',activo:0,estado_comercial:'INACTIVO'});
    for(const body of [{nombre:'X',email:'x@example.invalid'},{nombre:'X',email:'x@example.invalid',cliente_id:inactive.id},
      {nombre:'X',email:'x@example.invalid',cliente_id:cliente.id,password_hash:'inventado'},
      {nombre:'X',email:'x@example.invalid',rol:'ADMIN',cliente_id:cliente.id},
      {nombre:'X',email:'x@example.invalid',rol:'ADMIN',estado:'ACTIVO'}]) await adminCall('/users',{body},422);
    await adminCall(`/users/${student.id}`,{method:'PATCH',body:{rol:'ADMIN'}},422);
    await adminCall(`/users/${student.id}`,{method:'PATCH',body:{cliente_id:inactive.id}},422);
    await adminCall(`/users/${student.id}`,{method:'PATCH',body:{estado:'ACTIVO'}},422);
  });
  await caso('Activación manual de un solo uso, hash en DB y regeneración revoca el enlace anterior',async()=>{
    const old=(await adminCall(`/users/${student.id}/activar`,{body:{}},201)).data;
    activation=(await adminCall(`/users/${student.id}/activar`,{body:{}},201)).data;
    assert.notEqual(old.token,activation.token);assert.match(activation.enlace,/http:\/\/localhost:5173\/activar-cuenta\?token=/);
    const token=await modelos.usuarios_tokens.scope('conHash').findByPk(activation.id);assert.equal(token.token_hash,hashToken(activation.token));
    assert.ok((await modelos.usuarios_tokens.findByPk(old.id)).revocado_en);
    await json('/api/auth/activar',{body:{token:old.token,password:studentPassword}},400);
    await json('/api/auth/recuperar',{body:{token:activation.token,password:studentPassword}},400);
    await json('/api/auth/activar',{body:{token:activation.token,password:'corta'}},422);
    assert.equal((await token.reload()).usado_en,null);
    await json('/api/auth/activar',{body:{token:activation.token,password:studentPassword}});
    assert.ok((await token.reload()).usado_en);assert.equal((await modelos.usuarios.findByPk(student.id)).estado,'ACTIVO');
    await json('/api/auth/activar',{body:{token:activation.token,password:studentPassword}},400);
    studentJar=await login(student.email,studentPassword);assert.equal(studentJar.data.usuario.cambiar_password,0);
  });
  await caso('Cookie y rol de sesión: alumno no administra, IDs y cabeceras libres no autentican',async()=>{
    await json('/api/admin/users',{headers:{'x-user-id':admin.id,authorization:'Bearer inventado'}},401);
    await json('/api/admin/users',{jar:studentJar,headers:{'x-user-id':admin.id}},403);
    const profile=await json('/api/auth/me?id='+admin.id,{jar:studentJar});assert.equal(profile.data.usuario.id,student.id);
    assert.equal(leerCookie({headers:{cookie:studentJar.cookie+'; '+studentJar.cookie}}),null);
    await json('/api/auth/me',{headers:{cookie:studentJar.cookie+'; '+studentJar.cookie}},401);
    const session=await cargarSesion(studentJar.cookie.split('=')[1]);assert.equal(session.usuario.id,student.id);
  });
  await caso('CSRF y origen se validan antes de cualquier escritura',async()=>{
    const count=await modelos.usuarios.count();
    await adminCall('/users',{headers:{'x-csrf-token':'incorrecto'},body:{nombre:'No',email:'no@example.invalid',rol:'ADMIN'}},403);
    await adminCall('/users',{headers:{origin:'https://ajeno.example.invalid'},body:{nombre:'No',email:'no@example.invalid',rol:'ADMIN'}},403);
    await json('/api/auth/login',{headers:{origin:'https://ajeno.example.invalid'},body:{email:admin.email,password:adminPassword}},403);
    await json('/api/auth/login',{headers:{'content-type':'text/plain'},body:{email:admin.email,password:adminPassword}},415);
    await json('/api/auth/logout',{jar:studentJar,headers:{'x-csrf-token':''},body:{}},403);
    assert.equal(await modelos.usuarios.count(),count);
    assert.equal((await json('/api/auth/me',{jar:studentJar,headers:{origin:'http://localhost:5173'}})).data.usuario.id,student.id);
  });
  await caso('111 usuarios completos y paginación explícita, sin hashes ni datos privados',async()=>{
    while(await modelos.usuarios.count()<111) {
      const n=await modelos.usuarios.count();await modelos.usuarios.create({nombre:`Cuenta ${n}`,email:`cuenta${n}@example.invalid`,rol:'ADMIN',estado:'PENDIENTE'});
    }
    const all=await adminCall('/users');assert.equal(all.data.length,111);assert.equal(all.value.meta.paginado,false);
    const page=await adminCall('/users?pagina=2&por_pagina=10');assert.equal(page.data.length,10);assert.equal(page.value.meta.total,111);
    assert.equal((await adminCall('/users?rol=ALUMNO')).data.length,1);
    assert.ok(!JSON.stringify(all.value).includes('password_hash'));assert.ok(!JSON.stringify(all.value).includes(initialPassword));
    const detail=await adminCall(`/users/${student.id}`);assert.equal(detail.data.cliente.nombre,'Cliente sin cursos');
    await adminCall('/users?ordenar_por=password_hash',{},422);
  });
  await caso('Vencimiento de sesión es exclusivo y no depende de cron',async()=>{
    const jar=await login(student.email,studentPassword);
    await modelos.usuarios_sesiones.update({vence_en:literal('UTC_TIMESTAMP(3)')},{where:{token_hash:hashToken(jar.cookie.split('=')[1])}});
    await json('/api/auth/me',{jar},401);assert.ok(await cargarSesion(studentJar.cookie.split('=')[1]));
  });
  await caso('Logout revoca la cookie conservada y no afecta otra sesión',async()=>{
    const jar=await login(student.email,studentPassword),result=await json('/api/auth/logout',{jar,body:{}});
    assert.match(result.res.headers.get('set-cookie'),/Max-Age=0/);await json('/api/auth/me',{jar},401);
    assert.ok(await cargarSesion(studentJar.cookie.split('=')[1]));
    await json('/api/auth/logout',{jar,body:{}});
  });
  await caso('Recuperación manual revoca todas las sesiones y sustituye contraseña',async()=>{
    const other=await login(student.email,studentPassword);
    const recovery=(await adminCall(`/users/${student.id}/recuperar`,{body:{}},201)).data;
    await json('/api/auth/me',{jar:studentJar},401);await json('/api/auth/me',{jar:other},401);
    await json('/api/auth/recuperar',{body:{token:recovery.token,password:'Nueva contraseña del alumno 2026'}});
    await json('/api/auth/recuperar',{body:{token:recovery.token,password:'Otra contraseña del alumno 2026'}},400);
    await json('/api/auth/login',{body:{email:student.email,password:studentPassword}},401);
    studentJar=await login(student.email,'Nueva contraseña del alumno 2026');
  });
  await caso('Bloqueo de cuenta y desactivación de cliente revocan sin borrar ficha ni progreso',async()=>{
    const course=await modelos.cursos.create({titulo:'Curso',slug:'curso',creado_por:admin.id});
    const module=await modelos.curso_modulos.create({curso_id:course.id,titulo:'Módulo'});
    const lesson=await modelos.curso_lecciones.create({curso_id:course.id,modulo_id:module.id,titulo:'Lección'});
    const progress=await modelos.leccion_progreso.create({usuario_id:student.id,curso_id:course.id,leccion_id:lesson.id,posicion_segundos:34});
    const access=await modelos.curso_accesos.create({usuario_id:student.id,curso_id:course.id,asignado_por:admin.id});
    await adminCall(`/users/${student.id}`,{method:'PATCH',body:{estado:'BLOQUEADO'}});await json('/api/auth/me',{jar:studentJar},401);
    await adminCall(`/users/${student.id}`,{method:'PATCH',body:{estado:'ACTIVO'}});studentJar=await login(student.email,'Nueva contraseña del alumno 2026');
    await adminCall('/clients/'+cliente.id,{method:'DELETE'});await json('/api/auth/me',{jar:studentJar},401);
    await json('/api/auth/login',{body:{email:student.email,password:'Nueva contraseña del alumno 2026'}},401);
    await adminCall(`/users/${student.id}/recuperar`,{body:{}},409);
    assert.equal((await progress.reload()).posicion_segundos,34);assert.equal((await access.reload()).estado,'ACTIVO');
    await adminCall('/clients/'+cliente.id,{method:'PATCH',body:{activo:1}});studentJar=await login(student.email,'Nueva contraseña del alumno 2026');
  });
  await caso('Editar email invalida sesiones/enlaces, mantiene rol y ficha original',async()=>{
    const token=(await adminCall(`/users/${student.id}/recuperar`,{body:{}},201)).data;
    await adminCall(`/users/${student.id}`,{method:'PATCH',body:{email:'nuevo-alumno@example.invalid',nombre:'Alumno actualizado'}});
    await json('/api/auth/recuperar',{body:{token:token.token,password:'No debe aplicarse esta contraseña'}},400);
    const current=await modelos.usuarios.findByPk(student.id);assert.equal(current.cliente_id,cliente.id);assert.equal(current.rol,'ALUMNO');
    student.email=current.email;studentJar=await login(student.email,'Nueva contraseña del alumno 2026');
  });
  await caso('No desactivar el último administrador activo; baja lógica conserva historial',async()=>{
    await adminCall(`/users/${admin.id}`,{method:'DELETE'},409);
    const second=(await adminCall('/users',{body:{nombre:'Segundo Admin',email:'segundo-admin@example.invalid',rol:'ADMIN',password:'Clave del segundo administrador 2026'}},201)).data;
    assert.equal(second.cambiar_password,1);
    await adminCall(`/users/${second.id}`,{method:'DELETE'});assert.ok(await modelos.usuarios.findByPk(second.id));
    await adminCall(`/users/${admin.id}`,{method:'PATCH',body:{estado:'BLOQUEADO'}},409);
  });
  await caso('Error de auditoría revierte login y creación sin filtrar secretos',async()=>{
    const original=console.error,logs=[];console.error=value=>logs.push(String(value));
    modelos.auditoria_eventos.addHook('beforeCreate','fallo',row=>{if(['LOGIN','USUARIO_CREADO'].includes(row.accion))throw new Error('secreto interno');});
    try {
      const sessions=await modelos.usuarios_sesiones.count();
      const result=await json('/api/auth/login',{body:{email:admin.email,password:adminPassword}},500);assert.equal(result.res.headers.get('set-cookie'),null);
      assert.equal(await modelos.usuarios_sesiones.count(),sessions);
      await adminCall('/users',{body:{nombre:'No persistir',email:'rollback@example.invalid',rol:'ADMIN'}},500);
      assert.equal(await modelos.usuarios.count({where:{email:'rollback@example.invalid'}}),0);assert.ok(!logs.join('').includes('secreto interno'));
    } finally {console.error=original;modelos.auditoria_eventos.removeHook('beforeCreate','fallo');}
  });
  await caso('Sesión revocada entre middleware y escritura impide confirmar la operación',async()=>{
    const req={headers:{cookie:adminJar.cookie},method:'GET'};await Security.autenticar(req,{setHeader(){},status(){return this;},json(){}},()=>{});
    await modelos.usuarios_sesiones.update({revocada_en:literal('UTC_TIMESTAMP(3)')},{where:{id:req.session.id}});
    await assert.rejects(conAuditoria(req,req.user,'NO_DEBE_CONFIRMAR','usuarios',async()=>{throw new Error('No debe ejecutarse');}),error=>error.code==='SESION_INVALIDA');
    adminJar=await login(admin.email,adminPassword);
  });
  await caso('Enlace vencido y token de otra operación se rechazan sin consumir',async()=>{
    const token=(await adminCall(`/users/${student.id}/recuperar`,{body:{}},201)).data;
    await modelos.usuarios_tokens.update({vence_en:literal('UTC_TIMESTAMP(3)')},{where:{id:token.id}});
    await json('/api/auth/recuperar',{body:{token:token.token,password:studentPassword}},400);
    await json('/api/auth/recuperar',{body:{token:'invalido',password:studentPassword}},422);
    assert.equal((await modelos.usuarios_tokens.findByPk(token.id)).usado_en,null);
  });
  await caso('Rate limit por cuenta y por IP, sin confiar en X-Forwarded-For',async()=>{
    for(let n=0;n<10;n++)await json('/api/auth/login',{body:{email:'RATE@EXAMPLE.INVALID',password:'x'.repeat(129)},headers:{'x-forwarded-for':`1.1.1.${n}`}},401);
    await json('/api/auth/login',{body:{email:'rate@example.invalid',password:'x'.repeat(129)}},429);
    clock+=16*60000;
    for(let n=0;n<30;n++)await json('/api/auth/login',{body:{email:'mal',password:'x'},headers:{'x-forwarded-for':`2.2.2.${n}`}},422);
    await json('/api/auth/login',{body:{email:admin.email,password:adminPassword}},429);
  });
  await caso('Cookies de producción requieren Secure; SameSite=None también',async()=>{
    process.env.NODE_ENV='production';assert.equal(configAuth().secure,true);
    process.env.COOKIE_SECURE='false';assert.throws(()=>configAuth(),error=>error.code==='AUTH_CONFIGURACION');
    process.env.NODE_ENV='test';process.env.COOKIE_SAMESITE='None';assert.throws(()=>configAuth(),error=>error.code==='AUTH_CONFIGURACION');
    process.env.COOKIE_SECURE='true';assert.equal(configAuth().sameSite,'none');delete process.env.COOKIE_SECURE;delete process.env.COOKIE_SAMESITE;
    const audit=JSON.stringify(await modelos.auditoria_eventos.findAll());assert.ok(!audit.includes(initialPassword));assert.ok(!audit.includes('token_hash'));assert.ok(!audit.includes(activation.token));
  });
});
