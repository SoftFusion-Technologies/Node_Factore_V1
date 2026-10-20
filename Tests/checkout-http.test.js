import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes,randomUUID } from 'node:crypto';

process.env.NODE_ENV='test';process.env.COOKIE_SECURE='false';process.env.ALLOWED_ORIGINS='http://127.0.0.1:5173';
process.env.FRONTEND_URL='http://127.0.0.1:5173';process.env.TRUST_PROXY='false';
process.env.MP_HABILITADO='false';process.env.MP_MODO='PRUEBA';process.env.MP_ACCESS_TOKEN='TEST-credencial-ficticia-no-utilizable';
process.env.MP_FRONTEND_URL='https://frontend.example.invalid';process.env.MP_NOTIFICATION_URL='https://backend.example.invalid/api/mercadopago/webhook';
const {default:db}=await import('../src/DataBase/db.js');
const {modelos}=await import('../src/Models/index.js');
const {crearApp}=await import('../app.js');
const {crearCompra}=await import('../src/Services/Compra/compra.service.js');
const {conectarPrueba}=await import('./adapter-crm.js');

test('Checkout: HTTP público, token privado y Mercado Pago simulado, sin cobros reales',async t=>{
  const adapter=await conectarPrueba(db,{fixture:'campus.sqlite.sql'});
  const server=crearApp().listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port,originalFetch=global.fetch;
  let gatewayCalls=0,requestBody,behavior='ok',release,entered;
  global.fetch=async(url,options)=>{
    if(url!=='https://api.mercadopago.com/checkout/preferences')return originalFetch(url,options);
    gatewayCalls++;requestBody=JSON.parse(options.body);
    assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer TEST-credencial-ficticia-no-utilizable');
    if(behavior==='fail')throw new Error('Error de red controlado, sin datos privados');
    if(behavior==='wait'){entered();await new Promise(resolve=>{release=resolve;});}
    if(behavior==='badurl')return new Response(JSON.stringify({id:'pref-prueba',sandbox_init_point:'https://ajeno.example.invalid/?pref_id=pref-prueba'}),{headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({id:'pref-prueba',sandbox_init_point:'https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=pref-prueba'}),{headers:{'content-type':'application/json'}});
  };
  t.after(async()=>{global.fetch=originalFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await adapter.close();});
  const admin=await modelos.usuarios.create({nombre:'Juan prueba',email:'checkout@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:'fixture'});
  const course=await modelos.cursos.create({titulo:'Kit Emprendedor',slug:'kit-emprendedor',precio:'220000.50',estado:'PUBLICADO',visible_catalogo:1,venta_online_habilitada:1,creado_por:admin.id});
  async function send(path,{method='GET',token,body,headers={}}={}){
    const result=await originalFetch(base+path,{method,headers:{...(token?{'X-Compra-Token':token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:result.status,headers:result.headers,body:await result.json()};
  }
  async function nueva(){const token=randomBytes(32).toString('hex'),referencia=randomUUID();const body={referencia,nombre:'Comprador',email:'comprador@example.invalid',curso_ids:[String(course.id)]};
    const result=await send('/api/checkout/compras',{method:'POST',token,body});assert.equal(result.status,201,JSON.stringify(result.body));return {referencia,token,body};}
  let compra;
  await t.test('Token y origen obligatorios; CORS permite cabecera de compra',async()=>{
    assert.equal((await send('/api/checkout/compras',{method:'POST',body:{}})).status,401);
    assert.equal((await send('/api/checkout/compras',{method:'POST',token:'a'.repeat(64),body:{},headers:{Origin:'https://ajeno.example.invalid'}})).status,403);
    const pre=await originalFetch(base+'/api/checkout/compras',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type, X-Compra-Token'}});
    assert.equal(pre.status,204);assert.match(pre.headers.get('access-control-allow-headers'),/x-compra-token/);
  });
  await t.test('Crear, recuperar y reintentar la compra; otro token no accede',async()=>{
    compra=await nueva();
    const repeated=await send('/api/checkout/compras',{method:'POST',token:compra.token,body:compra.body});assert.equal(repeated.status,200);assert.equal(repeated.body.data.reutilizada,true);
    const result=await send('/api/checkout/compras/'+compra.referencia,{token:compra.token});assert.equal(result.status,200);assert.equal(result.body.data.total,'220000.50');assert.equal(result.headers.get('set-cookie'),null);
    assert.ok(!JSON.stringify(result.body).includes('hash'));assert.ok(!JSON.stringify(result.body).includes(compra.token));
    assert.equal((await send('/api/checkout/compras/'+compra.referencia,{token:randomBytes(32).toString('hex')})).status,404);
    assert.equal((await send('/api/checkout/compras/'+compra.referencia+'?token='+compra.token,{token:compra.token})).status,422);
    assert.equal(await modelos.compras.count(),1);assert.equal(await modelos.curso_accesos.count(),0);
  });
  // Benjamin Orellana - 18/10/2026 - El UUID conocido no autoriza lectura, cancelación ni pago de otra compra.
  await t.test('Referencia pública: sin token o con el de otra compra no permite leer ni modificar',async()=>{
    const otra={referencia:randomUUID(),token:randomBytes(32).toString('hex')}, antes=gatewayCalls;
    await crearCompra({...compra.body,referencia:otra.referencia},otra.token);
    const snapshot=await modelos.compras.findOne({where:{referencia:compra.referencia}});
    for(const suffix of ['', '/cancelar', '/mercadopago']) {
      const path='/api/checkout/compras/'+compra.referencia+suffix;
      const input=suffix?{method:'POST',body:{}}:{};
      const sinToken=await send(path,input);
      assert.equal(sinToken.status,401);assert.equal(sinToken.body.data,undefined);
      const ajeno=await send(path,{...input,token:otra.token});
      assert.equal(ajeno.status,404);assert.equal(ajeno.body.data,undefined);
      assert.ok(!JSON.stringify(ajeno.body).includes(compra.token));
      assert.equal((await send('/api/checkout/compras/'+otra.referencia+suffix,{...input,token:compra.token})).status,404);
    }
    const noExiste=await send('/api/checkout/compras/'+randomUUID(),{token:otra.token});
    const ajena=await send('/api/checkout/compras/'+compra.referencia,{token:otra.token});
    assert.deepEqual(ajena.body,noExiste.body);
    await assert.rejects(crearCompra(compra.body,otra.token),error=>error.status===404);
    const despues=await modelos.compras.findOne({where:{referencia:compra.referencia}});
    assert.equal(despues.estado,snapshot.estado);assert.equal(despues.mp_preferencia_estado,snapshot.mp_preferencia_estado);
    assert.equal(gatewayCalls,antes);assert.equal(await modelos.curso_accesos.count(),0);
  });
  await t.test('Sin configuración no contacta MP ni reserva un intento',async()=>{
    const result=await send('/api/checkout/compras/'+compra.referencia+'/mercadopago',{method:'POST',token:compra.token,body:{}});
    assert.equal(result.status,503);assert.equal(result.body.error.code,'MP_NO_CONFIGURADO');assert.equal(gatewayCalls,0);
    assert.equal((await modelos.compras.findOne({where:{referencia:compra.referencia}})).mp_preferencia_estado,'SIN_CREAR');
    process.env.MP_HABILITADO='true';process.env.MP_FRONTEND_URL='http://127.0.0.1:5173';
    assert.equal((await send('/api/checkout/compras/'+compra.referencia+'/mercadopago',{method:'POST',token:compra.token,body:{}})).status,503);
    process.env.MP_FRONTEND_URL='https://frontend.example.invalid';process.env.MP_MODO='PRODUCCION';
    const production=await send('/api/checkout/compras/'+compra.referencia+'/mercadopago',{method:'POST',token:compra.token,body:{}});
    assert.equal(production.status,503);assert.equal(production.body.error.code,'MP_MODO_NO_ADMITIDO');assert.equal(gatewayCalls,0);
    process.env.MP_MODO='PRUEBA';process.env.MP_HABILITADO='false';
  });
  await t.test('Preferencia conserva importe acordado, vence con la compra y devuelve solo sandbox',async()=>{
    process.env.MP_HABILITADO='true';await course.update({precio:'300000.00',acceso_duracion_cantidad:2});
    const path='/api/checkout/compras/'+compra.referencia+'/mercadopago';
    const result=await send(path,{method:'POST',token:compra.token,body:{}});assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(requestBody.items[0].unit_price,220000.5);assert.equal(requestBody.external_reference,compra.referencia);assert.equal(requestBody.expires,true);
    assert.ok(requestBody.back_urls.success.startsWith('https://frontend.example.invalid/compras/'));
    assert.equal(requestBody.expiration_date_to,result.body.data.vence_en);
    const again=await send(path,{method:'POST',token:compra.token,body:{}});assert.equal(again.status,200);assert.equal(again.body.data.reutilizada,true);assert.equal(gatewayCalls,1);
    const current=(await send('/api/checkout/compras/'+compra.referencia,{token:compra.token})).body.data;
    assert.equal(current.estado,'PENDIENTE');assert.equal(current.mercadopago.estado,'DISPONIBLE');assert.match(current.mercadopago.url,/sandbox\.mercadopago\.com/);
    assert.equal((await send('/api/checkout/compras/'+compra.referencia+'/cancelar',{method:'POST',token:compra.token,body:{}})).status,409);
    assert.equal(await modelos.usuarios.count(),1);assert.equal(await modelos.curso_accesos.count(),0);
  });
  await t.test('Una llamada en curso y una respuesta perdida bloquean otro POST al proveedor',async()=>{
    const c=await nueva(),path='/api/checkout/compras/'+c.referencia+'/mercadopago';behavior='wait';
    const started=new Promise(resolve=>{entered=resolve;});const first=send(path,{method:'POST',token:c.token,body:{}});await started;
    const second=await send(path,{method:'POST',token:c.token,body:{}});assert.equal(second.status,409);release();assert.equal((await first).status,200);
    const failed=await nueva();behavior='fail';
    const lostPath='/api/checkout/compras/'+failed.referencia+'/mercadopago',count=gatewayCalls;
    assert.equal((await send(lostPath,{method:'POST',token:failed.token,body:{}})).status,503);
    assert.equal((await modelos.compras.findOne({where:{referencia:failed.referencia}})).mp_preferencia_estado,'INCIERTA');
    assert.equal((await send(lostPath,{method:'POST',token:failed.token,body:{}})).status,409);assert.equal(gatewayCalls,count+1);
  });
  await t.test('URL ajena, compras vencidas y campos libres no habilitan pagos',async()=>{
    const c=await nueva();behavior='badurl';assert.equal((await send('/api/checkout/compras/'+c.referencia+'/mercadopago',{method:'POST',token:c.token,body:{}})).status,503);
    const expired=await nueva(),row=await modelos.compras.findOne({where:{referencia:expired.referencia}});
    await row.update({creado_en:new Date(Date.now()-120000),vence_en:new Date(Date.now()-60000)});
    const calls=gatewayCalls;assert.equal((await send('/api/checkout/compras/'+expired.referencia+'/mercadopago',{method:'POST',token:expired.token,body:{}})).status,409);assert.equal(gatewayCalls,calls);
    assert.equal((await send('/api/checkout/compras/'+compra.referencia+'/mercadopago',{method:'POST',token:compra.token,body:{total:1}})).status,422);
    const cancel=await nueva();assert.equal((await send('/api/checkout/compras/'+cancel.referencia+'/cancelar',{method:'POST',token:cancel.token,body:{}})).status,200);
  });
  await t.test('Un total incoherente no se envía al proveedor ni reserva una preferencia',async()=>{
    const c=await nueva(),calls=gatewayCalls;
    await modelos.compras.update({total:'1.00'},{where:{referencia:c.referencia}});
    const result=await send('/api/checkout/compras/'+c.referencia+'/mercadopago',{method:'POST',token:c.token,body:{}});
    assert.equal(result.status,409);assert.equal(result.body.error.code,'COMPRA_IMPORTE_INVALIDO');assert.equal(gatewayCalls,calls);
    assert.equal((await modelos.compras.findOne({where:{referencia:c.referencia}})).mp_preferencia_estado,'SIN_CREAR');
  });
});
