/* Benjamin Orellana - 18/10/2026 - Cookie de compra, CSRF y migración con HTTP/SQLite aislados. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { once } from 'node:events';
process.env.NODE_ENV='test';process.env.COOKIE_SECURE='false';process.env.MP_HABILITADO='false';
process.env.FRONTEND_URL='http://127.0.0.1:5173';
process.env.ALLOWED_ORIGINS='http://127.0.0.1:5173,https://factore.example.test,http://inseguro.example.test';
const {default:db}=await import('../src/DataBase/db.js');
const {modelos}=await import('../src/Models/index.js');
const {crearApp}=await import('../app.js');
const {conectarPrueba}=await import('./adapter-crm.js');

test('Checkout navegador: cookie HttpOnly por compra, CSRF en memoria y credencial anterior migrable',async t=>{
 const adapter=await conectarPrueba(db,{fixture:'campus.sqlite.sql'}),server=crearApp().listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await adapter.close();});
 const base='http://127.0.0.1:'+server.address().port,origin='https://factore.example.test';
 const admin=await modelos.usuarios.create({nombre:'Juan cookie',email:'cookie@example.invalid',rol:'ADMIN'});
 const curso=await modelos.cursos.create({titulo:'Motor cookie',slug:'motor-cookie',estado:'PUBLICADO',visible_catalogo:1,venta_online_habilitada:1,precio:'350000.00',creado_por:admin.id});
 const prefix=ref=>'/api/checkout/navegador/compras/'+ref;
 async function request(path,{method='GET',cookie,csrf,legacy,body,origen=origin}={}){
  const res=await fetch(base+path,{method,headers:{...(origen===null?{}:{Origin:origen}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(legacy?{'X-Compra-Token':legacy}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,headers:res.headers,body:await res.json()};
 }
 const body=ref=>({referencia:ref,nombre:'Compradora cookie',email:'cookie.compradora@example.invalid',curso_ids:[String(curso.id)]});
 async function sesion(ref,{legacy,origen=origin}={}) {
  const r=await request(prefix(ref)+'/sesion',{method:'POST',body:{},legacy,origen});
  assert.equal(r.status,200,JSON.stringify(r.body));
  const cookie=r.headers.get('set-cookie').split(';')[0];
  const s=await request(prefix(ref)+'/sesion',{cookie,origen});assert.equal(s.status,200,JSON.stringify(s.body));
  return {ref,cookie,csrf:s.body.data.csrf_token,raw:cookie.split('=')[1],setCookie:r.headers.get('set-cookie')};
 }
 let a,b;
 await t.test('HTTPS: __Host, Secure, HttpOnly, Lax y Path=/; la credencial no aparece en JSON',async()=>{
  const ref=randomUUID();a=await sesion(ref);
  assert.match(a.setCookie,/^__Host-fe_compra_/);assert.match(a.setCookie,/; Secure/);assert.match(a.setCookie,/; HttpOnly/);
  assert.match(a.setCookie,/; SameSite=Lax/);assert.match(a.setCookie,/; Path=\//);assert.doesNotMatch(a.setCookie,/Domain=/i);
  assert.match(a.raw,/^[0-9a-f]{64}$/);assert.match(a.csrf,/^[0-9a-f]{64}$/);assert.notEqual(a.raw,a.csrf);
  const result=await request(prefix(ref)+'/sesion',{cookie:a.cookie});assert.ok(!JSON.stringify(result.body).includes(a.raw));
  assert.equal(await modelos.compras.count(),0);
 });
 await t.test('Crear requiere origen y CSRF; cuerpo/ref de URL coincidentes e importe del servidor',async()=>{
  const url=prefix(a.ref),input=body(a.ref);
  assert.equal((await request(url,{method:'POST',cookie:a.cookie,body:input})).status,403);
  assert.equal((await request(url,{method:'POST',cookie:a.cookie,csrf:a.csrf,body:input,origen:null})).status,403);
  assert.equal((await request(url,{method:'POST',cookie:a.cookie,csrf:a.csrf,body:input,origen:'https://ajeno.invalid'})).status,403);
  assert.equal((await request(url,{method:'POST',cookie:a.cookie,csrf:a.csrf,body:{...input,referencia:randomUUID()}})).status,422);
  assert.equal((await request(url,{method:'POST',cookie:a.cookie,csrf:a.csrf,body:{...input,total:'1.00'}})).status,422);
  assert.equal(await modelos.compras.count(),0);
  const created=await request(url,{method:'POST',cookie:a.cookie,csrf:a.csrf,body:input});assert.equal(created.status,201);
  assert.equal(created.body.data.total,'350000.00');assert.ok(!JSON.stringify(created.body).includes(a.raw));
  const again=await request(url,{method:'POST',cookie:a.cookie,csrf:a.csrf,body:input});assert.equal(again.status,200);assert.equal(again.body.data.reutilizada,true);
 });
 await t.test('Cookie y CSRF de otra compra, cabecera vieja y cookie duplicada no autorizan',async()=>{
  b=await sesion(randomUUID());
  assert.equal((await request(prefix(a.ref),{})).status,401);
  assert.equal((await request(prefix(a.ref),{cookie:b.cookie})).status,401);
  assert.equal((await request(prefix(a.ref),{cookie:a.cookie,legacy:a.raw})).status,422);
  assert.equal((await request(prefix(a.ref),{cookie:a.cookie+'; '+a.cookie})).status,401);
  const wrong=a.cookie.replace(a.raw,randomBytes(32).toString('hex'));
  assert.equal((await request(prefix(a.ref),{cookie:wrong})).status,404);
  for(const suffix of ['/cancelar','/mercadopago']) {
   assert.equal((await request(prefix(a.ref)+suffix,{method:'POST',cookie:a.cookie,csrf:b.csrf,body:{}})).status,403);
   assert.equal((await request(prefix(a.ref)+suffix,{method:'POST',cookie:a.cookie,body:{csrf_token:a.csrf}})).status,403);
  }
  assert.equal((await modelos.compras.findOne({where:{referencia:a.ref}})).estado,'PENDIENTE');
 });
 await t.test('Conocer el UUID no permite reemplazar la cookie de una compra existente',async()=>{
  const before=await modelos.compras.scope('conHash').findOne({where:{referencia:a.ref}});
  const attack=await request(prefix(a.ref)+'/sesion',{method:'POST',body:{}});assert.equal(attack.status,404);assert.equal(attack.headers.get('set-cookie'),null);
  const counterfeit=await request(prefix(a.ref)+'/sesion',{method:'POST',body:{},legacy:randomBytes(32).toString('hex')});assert.equal(counterfeit.status,404);
  const after=await modelos.compras.scope('conHash').findOne({where:{referencia:a.ref}});assert.equal(after.token_hash,before.token_hash);
  const retry=await request(prefix(a.ref)+'/sesion',{method:'POST',body:{},cookie:a.cookie});assert.equal(retry.status,200);assert.ok(retry.headers.get('set-cookie').startsWith(a.cookie+';'));
 });
 await t.test('Cookie confirmada sobrevive recarga y opera sin la cabecera de credencial',async()=>{
  const s=await request(prefix(a.ref)+'/sesion',{cookie:a.cookie,origen:null});assert.equal(s.status,200);assert.equal(s.body.data.csrf_token,a.csrf);
  const get=await request(prefix(a.ref),{cookie:a.cookie,origen:null});assert.equal(get.status,200);
  const cancel=await request(prefix(a.ref)+'/cancelar',{method:'POST',cookie:a.cookie,csrf:a.csrf,body:{}});assert.equal(cancel.status,200);assert.equal(cancel.body.data.estado,'CANCELADA');
 });
 await t.test('Migración prueba la credencial anterior y permite recuperarla si se pierde una respuesta',async()=>{
  const ref=randomUUID(),raw=randomBytes(32).toString('hex');
  assert.equal((await request('/api/checkout/compras',{method:'POST',legacy:raw,body:body(ref)})).status,201);
  const migrated=await sesion(ref,{legacy:raw});assert.equal(migrated.raw,raw);
  const lost=await request(prefix(ref)+'/sesion',{method:'POST',legacy:raw,body:{}});assert.equal(lost.status,200);
  assert.equal((await request(prefix(ref),{cookie:migrated.cookie})).status,200);
  assert.equal((await request('/api/checkout/compras/'+ref,{legacy:raw})).status,200);
  assert.equal(await modelos.compras.count(),2);assert.equal(await modelos.curso_accesos.count(),0);
 });
 await t.test('Bootstrap rechaza origen ausente/ajeno, filtros y HTTP no local; HTTP local solo DESA',async()=>{
  const ref=randomUUID(),url=prefix(ref)+'/sesion';
  for(const origen of [null,'https://ajeno.invalid','http://inseguro.example.test']) {
   const result=await request(url,{method:'POST',body:{},origen});assert.equal(result.status,403);assert.equal(result.headers.get('set-cookie'),null);
  }
  assert.equal((await request(url+'?token=libre',{method:'POST',body:{}})).status,422);
  const local=await sesion(ref,{origen:'http://127.0.0.1:5173'});assert.match(local.setCookie,/^fe_compra_local_/);assert.doesNotMatch(local.setCookie,/; Secure/);assert.match(local.setCookie,/; HttpOnly/);
  const before=process.env.NODE_ENV;process.env.NODE_ENV='production';process.env.COOKIE_SECURE='true';
  try { assert.equal((await request(url,{method:'POST',body:{},origen:'http://127.0.0.1:5173'})).status,403); }
  finally {process.env.NODE_ENV=before;process.env.COOKIE_SECURE='false';}
 });
});
