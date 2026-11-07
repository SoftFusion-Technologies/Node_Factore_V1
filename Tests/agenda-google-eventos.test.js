/* Benjamin Orellana - 07/11/2026 - Crear y comprobar eventos propios por HTTP; Google simulado, sin calendario real. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
const origen = 'http://127.0.0.1:5173';
Object.assign(process.env, { NODE_ENV:'test', DB_PASSWORD:'Fixture eventos Google', FRONTEND_URL:origen,
  ALLOWED_ORIGINS:origen, COOKIE_SECURE:'false', COOKIE_SAMESITE:'Lax', MP_HABILITADO:'false', CORREO_HABILITADO:'false',
  GOOGLE_AGENDA_HABILITADO:'true',GOOGLE_AGENDA_ORIGEN:origen,GOOGLE_AGENDA_CLIENT_ID:'fixture.apps.googleusercontent.com',
  GOOGLE_AGENDA_CLIENT_SECRET:'fixture-privado',GOOGLE_AGENDA_CLAVE_CIFRADO:'ae'.repeat(32) });
const {default:db}=await import('../src/DataBase/db.js');
const {modelos:m}=await import('../src/Models/index.js');
const {crearApp}=await import('../app.js');
const {conectarPrueba}=await import('./adapter-crm.js');
const {hashPassword}=await import('../src/utils/password.utils.js');
const {scopeGoogleAgenda,scopeEscrituraGoogleAgenda}=await import('../src/Services/Agenda/agendaGoogleProveedor.service.js');

test('Eventos Google: permiso adicional, confirmación remota, reintentos y propiedad', async t=>{
 const adapter=await conectarPrueba(db,{extras:['agenda.sqlite.sql','agenda-google.sqlite.sql']});
 const password='Evento Google prueba 2026!',password_hash=await hashPassword(password);
 async function cuenta(nombre,acceso){
  const cliente=await m.crm_clientes.create({nombre,activo:1});
  const user=await m.usuarios.create({nombre,email:nombre+'@eventos.invalid',rol:'ALUMNO',cliente_id:cliente.id,estado:'ACTIVO',password_hash});
  if(acceso)await m.agenda_accesos.create({usuario_id:user.id,estado:'ACTIVO',inicio_en:'2020-01-01T00:00:00Z'});
  return user;
 }
 const ana=await cuenta('ana',true),luz=await cuenta('luz',true),sin=await cuenta('sin',false);
 const server=crearApp().listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port,original=globalThis.fetch;
 t.after(async()=>{globalThis.fetch=original;server.closeAllConnections();await new Promise(r=>server.close(r));await adapter.close();});
 const remoto=new Map(),ruta='/agenda/google',scopeCompleto=scopeGoogleAgenda+' '+scopeEscrituraGoogleAgenda;
 let scope=scopeCompleto,challenge,posts=0,calls=0,modo='ok',trasGet;
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input);calls++;assert.equal(options.redirect,'error');
  if(url.href==='https://oauth2.googleapis.com/token'){
   if(options.body.get('grant_type')==='authorization_code'){
    assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'),challenge);
    return json({refresh_token:'fixture-refresh',scope});
   }
   return json({access_token:'fixture-access',scope});
  }
  assert.equal(url.origin,'https://www.googleapis.com');
  assert.equal(options.headers.Authorization,'Bearer fixture-access');
  if(url.pathname.endsWith('/primary/events')&&options.method!=='POST')return json({items:[]});
  if(options.method==='POST'){
   posts++;assert.equal(url.pathname,'/calendar/v3/calendars/primary/events');assert.equal(url.searchParams.get('sendUpdates'),'none');
   const body=JSON.parse(options.body);
   assert.deepEqual(Object.keys(body).sort(),['end','extendedProperties','id','start','summary']);
   assert.match(body.id,/^[0-9a-f]{64}$/);
   if(modo==='rechazado')return json({error:{message:'Detalle privado'}},403);
   if(remoto.has(body.id))return json({error:{}},409);
   const data={...body,status:'confirmed',htmlLink:'https://calendar.google.com/calendar/event?eid=fixture'};
   remoto.set(body.id,data);
   if(modo==='perdido')throw new Error('Respuesta perdida');
   return json(data);
  }
  assert.equal(options.method,undefined);
  const id=url.pathname.split('/').at(-1);
  if(trasGet){const f=trasGet;trasGet=null;await f();}
  const encontrado=remoto.get(id);
  return encontrado===null?json({error:{}},410):encontrado?json(encontrado):json({error:{}},404);
 };
 async function req(path,jar,method='GET',body,expected=200,headers={}){
  const res=await original(base+'/api'+path,{method,redirect:'manual',headers:{
   origin:origen,...(jar?{cookie:jar.cookie,'x-csrf-token':jar.csrf}:{}),
   ...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=res.status===303?{}:await res.json();
  assert.equal(res.status,expected,JSON.stringify(value));return {res,value};
 }
 async function login(user){
  const {res,value}=await req('/auth/login',null,'POST',{email:user.email,password});
  return {cookie:res.headers.get('set-cookie').split(';')[0],csrf:value.data.csrf_token};
 }
 const jar=await login(ana),ajena=await login(luz),bloqueada=await login(sin);
 async function conectar(escritura=true,expected=303){
  const {value}=await req(ruta+'/conectar',jar,'POST',escritura?{escritura:true}:{});
  const url=new URL(value.data.url);challenge=url.searchParams.get('code_challenge');
  assert.equal(url.searchParams.get('include_granted_scopes'),'true');
  assert.equal(url.searchParams.get('scope'),escritura?scopeCompleto:scopeGoogleAgenda);
  return req(ruta+'/callback?state='+url.searchParams.get('state')+'&code=fixture-code',jar,'GET',undefined,expected);
 }
 let revision;
 const cuerpo=()=>({referencia:randomUUID(),conexion_revision:revision,titulo:'Reunión de estrategia 🚀',todo_el_dia:false,
  inicio:'2026-11-09T13:00:00.000Z',fin:'2026-11-09T14:00:00.000Z'});
 const estado=body=>ruta+'/eventos/'+body.referencia+'?conexion_revision='+body.conexion_revision;
 await t.test('Sin sesión, permiso, CSRF o consentimiento de escritura no se envía un evento',async()=>{
  await req(ruta+'/eventos',null,'POST',{},401);
  await req(ruta+'/eventos',bloqueada,'POST',{},403);
  await req(ruta+'/conectar',jar,'POST',{escritura:'true'},422);
  await conectar(false);
  const {value}=await req(ruta+'/dias/2026-11-09',jar);revision=value.data.conexion_revision;
  assert.equal(value.data.escritura_habilitada,false);
  const antes=calls;await req(ruta+'/eventos',jar,'POST',cuerpo(),409);assert.equal(calls,antes);
 });
 await t.test('Permiso adicional ligado al state; el cliente no puede fingirlo y lectura sigue disponible',async()=>{
  scope=scopeGoogleAgenda;
  const denegado=await conectar(true);
  assert.match(denegado.res.headers.get('location'),/google=error/);
  assert.equal((await req(ruta+'/dias/2026-11-09',jar)).value.data.escritura_habilitada,false);
  scope=scopeCompleto;await conectar(true);
  const {value}=await req(ruta+'/dias/2026-11-09',jar);revision=value.data.conexion_revision;
  assert.equal(value.data.escritura_habilitada,true);
  assert.doesNotMatch(JSON.stringify(value),/fixture-refresh|fixture-access|secret/);
  await req(ruta+'/eventos',jar,'POST',cuerpo(),403,{'x-csrf-token':'ajeno'});
  await req(ruta+'/eventos',jar,'POST',{...cuerpo(),usuario_id:luz.id},422);
  await req(ruta+'/eventos',jar,'POST',{...cuerpo(),fin:'2026-11-09T10:00:00.000Z'},422);
  await req(ruta+'/eventos',jar,'POST',{...cuerpo(),todo_el_dia:true,inicio:'2026-02-30',fin:'2026-03-01'},422);
  assert.equal(posts,0);
 });
 let primero;
 await t.test('Crear confirma desde Google; repetir conserva un evento y una auditoría sin textos privados',async()=>{
  const body=cuerpo();primero=body;
  const {value}=await req(ruta+'/eventos',jar,'POST',body);
  assert.equal(value.data.estado,'CONFIRMADO');assert.equal(posts,1);
  const event=remoto.get(value.data.evento_id);
  assert.equal(event.summary,body.titulo);assert.equal(event.start.dateTime,body.inicio);assert.equal(event.end.timeZone,'America/Argentina/Buenos_Aires');
  assert.deepEqual((await req(ruta+'/eventos',jar,'POST',body)).value.data,value.data);
  assert.equal((await req(estado(body),jar)).value.data.estado,'CONFIRMADO');
  assert.equal(posts,1);
  const audit=await m.auditoria_eventos.findAll({where:{accion:'AGENDA_GOOGLE_EVENTO_CREADO'}});
  assert.equal(audit.length,1);assert.doesNotMatch(JSON.stringify(audit),/Reunión|estrategia/);
  await req(ruta+'/eventos',jar,'POST',{...body,titulo:'Otro título'},409);
  await req(estado(body),ajena,'GET',undefined,409);
  assert.equal(posts,1);
 });
 await t.test('Respuesta perdida se comprueba por GET; ningún segundo POST a Google ni éxito anticipado',async()=>{
  modo='perdido';const body=cuerpo();const antes=posts;
  const {value}=await req(ruta+'/eventos',jar,'POST',body,502);
  assert.equal(value.error.code,'GOOGLE_EVENTO_PENDIENTE');assert.equal(posts,antes+1);
  modo='ok';assert.equal((await req(estado(body),jar)).value.data.estado,'CONFIRMADO');
  await req(ruta+'/eventos',jar,'POST',body);assert.equal(posts,antes+1);
  assert.equal((await req(estado(cuerpo()),jar)).value.data.estado,'SIN_CONFIRMAR');
 });
 await t.test('Dos clics concurrentes comparten identidad y solo uno puede insertar en Google',async()=>{
  const body=cuerpo(),antes=posts;
  let liberar,avisar;const espera=new Promise(r=>{liberar=r;}),comenzo=new Promise(r=>{avisar=r;});
  trasGet=async()=>{avisar();await espera;};
  const primero=req(ruta+'/eventos',jar,'POST',body);
  await comenzo;
  try{
   const segundo=await req(ruta+'/eventos',jar,'POST',body,409);
   assert.equal(segundo.value.error.code,'GOOGLE_EVENTO_EN_CURSO');
  }finally{liberar();}
  assert.equal((await primero).value.data.estado,'CONFIRMADO');assert.equal(posts,antes+1);
 });
 await t.test('Día completo usa fechas exclusivas; rechazos y eventos eliminados no se anuncian creados',async()=>{
  const body={...cuerpo(),todo_el_dia:true,inicio:'2026-11-09',fin:'2026-11-11'};
  const {value}=await req(ruta+'/eventos',jar,'POST',body);const e=remoto.get(value.data.evento_id);
  assert.deepEqual(e.start,{date:'2026-11-09'});assert.deepEqual(e.end,{date:'2026-11-11'});
  remoto.set(value.data.evento_id,null);const antes=posts;
  assert.equal((await req(ruta+'/eventos',jar,'POST',body)).value.data.estado,'ELIMINADO');assert.equal(posts,antes);
  modo='rechazado';const error=(await req(ruta+'/eventos',jar,'POST',cuerpo(),409)).value.error;
  assert.equal(error.code,'GOOGLE_EVENTO_RECHAZADO');assert.doesNotMatch(JSON.stringify(error),/Detalle privado/);modo='ok';
 });
 await t.test('Un evento editado en Google conserva sus cambios; un permiso remoto retirado impide nuevas escrituras',async()=>{
  const id=(await req(estado(primero),jar)).value.data.evento_id;
  remoto.get(id).summary='Editado directamente en Google';const antes=posts;
  await req(ruta+'/eventos',jar,'POST',primero);assert.equal(remoto.get(id).summary,'Editado directamente en Google');assert.equal(posts,antes);
  scope=scopeGoogleAgenda;await req(ruta+'/eventos',jar,'POST',cuerpo(),409);assert.equal(posts,antes);scope=scopeCompleto;
 });
 await t.test('Revocar Agenda mientras se consulta Google se revalida antes del POST',async()=>{
  const antes=posts;
  trasGet=()=>m.agenda_accesos.update({estado:'SUSPENDIDO'},{where:{usuario_id:ana.id}});
  await req(ruta+'/eventos',jar,'POST',cuerpo(),403);assert.equal(posts,antes);
  await m.agenda_accesos.update({estado:'ACTIVO'},{where:{usuario_id:ana.id}});
 });
 await t.test('Fallo de auditoría conserva el intento remoto recuperable sin duplicar el evento',async()=>{
  const create=m.auditoria_eventos.create;
  m.auditoria_eventos.create=async()=>{throw new Error('fallo auditoría');};
  const body=cuerpo(),antes=posts;
  try{await req(ruta+'/eventos',jar,'POST',body,500);}finally{m.auditoria_eventos.create=create;}
  assert.equal(posts,antes+1);
  assert.equal((await req(estado(body),jar)).value.data.estado,'CONFIRMADO');assert.equal(posts,antes+1);
  assert.equal(await m.agenda_tareas.count(),0);assert.equal(await m.agenda_dias.count(),0);
 });
});
