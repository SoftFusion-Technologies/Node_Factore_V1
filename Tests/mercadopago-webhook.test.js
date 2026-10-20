import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac,randomUUID,randomBytes } from 'node:crypto';
process.env.NODE_ENV='test';process.env.COOKIE_SECURE='false';process.env.ALLOWED_ORIGINS='http://127.0.0.1:5173';
process.env.FRONTEND_URL='http://127.0.0.1:5173';process.env.TRUST_PROXY='false';
process.env.MP_HABILITADO='true';process.env.MP_MODO='PRUEBA';process.env.MP_ACCESS_TOKEN='TEST-ficticio-no-utilizable';
process.env.MP_FRONTEND_URL='https://front.example.invalid';process.env.MP_NOTIFICATION_URL='https://back.example.invalid/api/mercadopago/webhook';
process.env.MP_COLLECTOR_ID='123456';process.env.MP_WEBHOOK_SECRET='Secreto-ficticio-para-pruebas-aisladas';
const {default:db}=await import('../src/DataBase/db.js');
const {modelos}=await import('../src/Models/index.js');
const {crearApp}=await import('../app.js');
const {crearCompra}=await import('../src/Services/Compra/compra.service.js');
const {conectarPrueba}=await import('./adapter-crm.js');
const {fecha}=await import('../src/Services/Pago/mercadoPago.service.js');

test('Mercado Pago: webhook firmado, GET simulado y persistencia aislada; sin cobros reales',async t=>{
  const adapter=await conectarPrueba(db,{fixture:'campus.sqlite.sql'});
  const server=crearApp().listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port,originalFetch=global.fetch;
  const payments=new Map(),orders=new Map();let calls=0,offline=false,sequence=1000;
  // Benjamin Orellana - 18/10/2026 - Simular el perfil remoto del dueño del token, sin inferir entorno por su prefijo.
  let owner={id:123456,site_id:'MLA',tags:[]},ownerStatus=200;
  global.fetch=async(url,options)=>{
    const target=new URL(url);
    if(target.origin===base)return originalFetch(url,options);
    if(target.origin==='https://api.mercadolibre.com') {
      assert.equal(target.pathname,'/users/me');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer TEST-ficticio-no-utilizable');calls++;
      if(offline)throw new Error('Proveedor simulado no disponible');
      return new Response(JSON.stringify(owner),{status:ownerStatus,headers:{'content-type':'application/json'}});
    }
    assert.equal(target.origin,'https://api.mercadopago.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer TEST-ficticio-no-utilizable');calls++;
    if(offline)throw new Error('Proveedor simulado no disponible');
    const map=target.pathname.startsWith('/v1/payments/')?payments:orders;
    const result=map.get(target.pathname.split('/').at(-1));
    return new Response(JSON.stringify(result||{}),{status:result?200:404,headers:{'content-type':'application/json'}});
  };
  t.after(async()=>{global.fetch=originalFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await adapter.close();});
  const admin=await modelos.usuarios.create({nombre:'Juan pruebas',email:'juan-webhook@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:'fixture'});
  const course=await modelos.cursos.create({titulo:'Kit Emprendedor',slug:'kit-prueba',precio:'220000.50',estado:'PUBLICADO',visible_catalogo:1,venta_online_habilitada:1,creado_por:admin.id});
  async function nueva({paymentChanges={},orderChanges={}}={}) {
    const token=randomBytes(32).toString('hex'),referencia=randomUUID();
    await crearCompra({referencia,nombre:'Comprador prueba',email:'comprador-webhook@example.invalid',curso_ids:[course.id]},token);
    const compra=await modelos.compras.findOne({where:{referencia}}),pagoId=String(++sequence),orderId=String(sequence+10000),preference='pref-'+sequence;
    await compra.update({mp_preferencia_estado:'DISPONIBLE',mp_preferencia_id:preference,mp_checkout_url:'https://sandbox.mercadopago.com/mla/checkout/pay?pref_id='+preference});
    const approved=new Date(fecha(compra.creado_en).getTime()+100).toISOString(),updated=new Date(fecha(compra.creado_en).getTime()+200).toISOString();
    const payment={id:Number(pagoId),collector_id:123456,live_mode:false,external_reference:referencia,
      order:{id:Number(orderId),type:'mercadopago'},status:'approved',status_detail:'accredited',currency_id:'ARS',
      transaction_amount:220000.5,transaction_amount_refunded:0,date_approved:approved,date_last_updated:updated,
      payer:{email:'no-guardar@example.invalid'},card:{last_four_digits:'9999'},...paymentChanges};
    const order={id:Number(orderId),collector:{id:123456},preference_id:preference,external_reference:referencia,payments:[{id:Number(pagoId)}],...orderChanges};
    payments.set(pagoId,payment);orders.set(orderId,order);
    return {compra,pagoId,payment,order,token};
  }
  function headers(pagoId,{requestId=randomUUID(),ts='1704908010',signature}={}){
    const v1=createHmac('sha256',process.env.MP_WEBHOOK_SECRET).update(`id:${pagoId};request-id:${requestId};ts:${ts};`).digest('hex');
    return {'Content-Type':'application/json','x-request-id':requestId,'x-signature':signature||`ts=${ts},v1=${v1}`};
  }
  async function notify(c,{query='?data.id='+c.pagoId+'&type=payment',body={type:'payment',action:'payment.updated',data:{id:c.pagoId}},customHeaders={},raw}={}){
    const result=await originalFetch(base+'/api/mercadopago/webhook'+query,{method:'POST',headers:{...headers(c.pagoId),...customHeaders},body:raw??JSON.stringify(body)});
    return {status:result.status,body:await result.json()};
  }
  const pagoRow=c=>modelos.compra_pagos.findOne({where:{mp_pago_id:c.pagoId}});
  const eventCount=c=>modelos.auditoria_eventos.count({where:{entidad:'compras',entidad_id:c.compra.id,accion:'COMPRA_PAGADA'}});
  await t.test('Sin configuración o firma válida no consulta ni modifica',async()=>{
    const c=await nueva(),before=calls;
    process.env.MP_HABILITADO='false';assert.equal((await notify(c)).status,503);process.env.MP_HABILITADO='true';
    assert.equal((await notify(c,{customHeaders:{'x-signature':'ts=1704908010,v1='+'0'.repeat(64)}})).status,401);
    assert.equal((await notify(c,{customHeaders:{'x-signature':'ts=1704908010,ts=1704908010'}})).status,401);
    assert.equal((await notify(c,{query:'?data.id='+c.pagoId+'&data.id=123&type=payment'})).status,401);
    assert.equal((await notify(c,{query:'?data.id=../../file&type=payment'})).status,401);
    assert.equal(calls,before);assert.equal(await modelos.compra_pagos.count(),0);
  });
  await t.test('Firma de URL no autentica un ID distinto del cuerpo ni JSON corrupto',async()=>{
    const c=await nueva(),before=calls;
    assert.equal((await notify(c,{body:{type:'payment',action:'payment.updated',data:{id:'888'}}})).status,400);
    assert.equal((await notify(c,{raw:'{'})).status,400);
    assert.equal((await notify(c,{raw:JSON.stringify({type:'payment',data:{id:c.pagoId},extra:'x'.repeat(17000)})})).status,413);
    assert.equal(calls,before);
  });
  let pagada;
  await t.test('Aprobado con importe exacto confirma una vez, sin confiar en body.status ni email del pagador',async()=>{
    pagada=await nueva();const result=await notify(pagada,{body:{type:'payment',action:'payment.updated',data:{id:pagada.pagoId},status:'rejected',total:1}});
    assert.equal(result.status,200,JSON.stringify(result.body));assert.deepEqual(result.body,{ok:true});
    await pagada.compra.reload();assert.equal(pagada.compra.estado,'PAGADA');assert.equal(pagada.compra.usuario_id,null);
    assert.equal((await pagoRow(pagada)).validacion,'VALIDADO');assert.equal(await eventCount(pagada),1);
    assert.equal((await notify(pagada)).status,200);assert.equal(await eventCount(pagada),1);
    assert.equal(await modelos.usuarios.count(),1);assert.equal(await modelos.crm_clientes.count(),0);assert.equal(await modelos.curso_accesos.count(),0);
    assert.ok(!JSON.stringify((await pagoRow(pagada)).toJSON()).includes('no-guardar'));
    const owned=await originalFetch(base+'/api/checkout/compras/'+pagada.compra.referencia,{headers:{'X-Compra-Token':pagada.token}});
    assert.equal((await owned.json()).data.estado,'PAGADA');
  });
  await t.test('Pendiente no paga; actualización aprobada sí; versión vieja no retrocede',async()=>{
    const c=await nueva({paymentChanges:{status:'pending',status_detail:'pending_waiting_payment',date_approved:null}});
    assert.equal((await notify(c)).status,200);await c.compra.reload();assert.equal(c.compra.estado,'PENDIENTE');
    const old={...c.payment};c.payment.status='approved';c.payment.status_detail='accredited';c.payment.date_approved=c.payment.date_last_updated;
    c.payment.date_last_updated=new Date(Date.parse(c.payment.date_last_updated)+1000).toISOString();
    assert.equal((await notify(c)).status,200);await c.compra.reload();assert.equal(c.compra.estado,'PAGADA');
    payments.set(c.pagoId,old);assert.equal((await notify(c)).status,200);assert.equal((await pagoRow(c)).estado,'approved');assert.equal(await eventCount(c),1);
  });
  await t.test('Importe y moneda distintos quedan en revisión, nunca PAGADA',async()=>{
    for(const changes of [{transaction_amount:1},{currency_id:'USD'}]) {
      const c=await nueva({paymentChanges:changes});assert.equal((await notify(c)).status,200);await c.compra.reload();
      assert.equal(c.compra.estado,'PENDIENTE');assert.equal((await pagoRow(c)).validacion,'REVISION');assert.equal(await eventCount(c),0);
    }
  });
  await t.test('Otro vendedor, modo real y preferencia ajena se rechazan sin asociar el pago',async()=>{
    for(const options of [{paymentChanges:{collector_id:999}},{paymentChanges:{live_mode:true}},{orderChanges:{preference_id:'pref-ajena'}}]) {
      const c=await nueva(options);assert.equal((await notify(c)).status,503);assert.equal(await pagoRow(c),null);
      await c.compra.reload();assert.equal(c.compra.estado,'PENDIENTE');
    }
  });
  await t.test('Vendedor test_user verificado permite live_mode=true en DESA y conserva idempotencia',async()=>{
    owner={id:123456,site_id:'MLA',user_type:'normal',tags:['normal','test_user']};
    try {
      const c=await nueva({paymentChanges:{live_mode:true}});
      assert.equal((await notify(c)).status,200);
      await c.compra.reload();assert.equal(c.compra.estado,'PAGADA');
      assert.equal((await pagoRow(c)).modo_prueba,1);assert.equal((await pagoRow(c)).validacion,'VALIDADO');
      assert.equal((await notify(c)).status,200);assert.equal(await eventCount(c),1);
    } finally {owner={id:123456,site_id:'MLA',tags:[]};}
  });
  await t.test('Perfil ajeno, país distinto, etiqueta ausente o consulta fallida no confirman el pago',async()=>{
    try {
      for(const profile of [
        {id:999,site_id:'MLA',tags:['test_user']},
        {id:123456,site_id:'MLB',tags:['test_user']},
        {id:123456,site_id:'MLA',tags:[]},
        {id:123456,site_id:'MLA',tags:'test_user'}
      ]) {
        owner=profile;
        const c=await nueva({paymentChanges:{live_mode:true}});
        assert.equal((await notify(c)).status,503);assert.equal(await pagoRow(c),null);
        await c.compra.reload();assert.equal(c.compra.estado,'PENDIENTE');
      }
      owner={id:123456,site_id:'MLA',tags:['test_user']};ownerStatus=503;
      const c=await nueva({paymentChanges:{live_mode:true}});
      assert.equal((await notify(c)).status,503);assert.equal(await pagoRow(c),null);
    } finally {owner={id:123456,site_id:'MLA',tags:[]};ownerStatus=200;}
  });
  await t.test('Proveedor caído y auditoría fallida permiten reintentar sin media confirmación',async()=>{
    const c=await nueva();offline=true;assert.equal((await notify(c)).status,503);offline=false;assert.equal(await pagoRow(c),null);
    const original=modelos.auditoria_eventos.create;modelos.auditoria_eventos.create=async()=>{throw new Error('Fallo de auditoría controlado');};
    try {assert.equal((await notify(c)).status,500);}finally{modelos.auditoria_eventos.create=original;}
    assert.equal(await pagoRow(c),null);await c.compra.reload();assert.equal(c.compra.estado,'PENDIENTE');
    assert.equal((await notify(c)).status,200);assert.equal(await eventCount(c),1);
  });
  await t.test('Reintegro parcial y contracargo conservan historia y marcan revisión',async()=>{
    pagada.payment.transaction_amount_refunded=50;
    pagada.payment.date_last_updated=new Date(Date.parse(pagada.payment.date_last_updated)+1000).toISOString();
    assert.equal((await notify(pagada)).status,200);assert.equal((await pagoRow(pagada)).motivo_revision,'MP_REINTEGRO_O_DISPUTA');
    await pagada.compra.reload();assert.equal(pagada.compra.estado,'PAGADA');
    const owned=await originalFetch(base+'/api/checkout/compras/'+pagada.compra.referencia,{headers:{'X-Compra-Token':pagada.token}});
    assert.equal((await owned.json()).data.pago.requiere_revision,true);assert.equal(await eventCount(pagada),1);
    const c=await nueva({paymentChanges:{status:'charged_back'}});assert.equal((await notify(c)).status,200);assert.equal((await pagoRow(c)).validacion,'REVISION');
  });
  await t.test('Segundo pago aprobado de una compra se registra como duplicado',async()=>{
    const c=await nueva();assert.equal((await notify(c)).status,200);
    const second=String(++sequence);payments.set(second,{...c.payment,id:Number(second)});c.order.payments.push({id:Number(second)});
    assert.equal((await notify({...c,pagoId:second})).status,200);
    assert.equal((await modelos.compra_pagos.findOne({where:{mp_pago_id:second}})).motivo_revision,'MP_PAGO_DUPLICADO');assert.equal(await eventCount(c),1);
  });
  await t.test('Un segundo intento pendiente tampoco puede aprobarse tras reintegrar el primero',async()=>{
    const c=await nueva();assert.equal((await notify(c)).status,200);
    const second=String(++sequence),secondPayment={...c.payment,id:Number(second),status:'pending',status_detail:'pending_waiting_payment',date_approved:null};
    payments.set(second,secondPayment);c.order.payments.push({id:Number(second)});
    assert.equal((await notify({...c,pagoId:second})).status,200);
    c.payment.transaction_amount_refunded=220000.5;c.payment.status='refunded';
    c.payment.date_last_updated=new Date(Date.parse(c.payment.date_last_updated)+1000).toISOString();
    assert.equal((await notify(c)).status,200);
    Object.assign(secondPayment,{status:'approved',status_detail:'accredited',date_approved:c.payment.date_approved,date_last_updated:c.payment.date_last_updated});
    assert.equal((await notify({...c,pagoId:second})).status,200);
    assert.equal((await modelos.compra_pagos.findOne({where:{mp_pago_id:second}})).motivo_revision,'MP_PAGO_DUPLICADO');assert.equal(await eventCount(c),1);
  });
  await t.test('Aprobación dentro del plazo recibida tarde se acepta; aprobación fuera se revisa',async()=>{
    for(const late of [false,true]) {
      const c=await nueva(),now=Date.now();await c.compra.update({creado_en:new Date(now-3600000),vence_en:new Date(now-2700000)});
      c.payment.date_approved=new Date(now-(late?2400000:3000000)).toISOString();c.payment.date_last_updated=new Date(now).toISOString();
      assert.equal((await notify(c)).status,200);await c.compra.reload();assert.equal(c.compra.estado,late?'PENDIENTE':'PAGADA');
      if(late)assert.equal((await pagoRow(c)).motivo_revision,'MP_PAGO_FUERA_PLAZO');
    }
  });
  await t.test('Referencia desconocida se ignora; ID numérico inseguro y centavos fraccionarios se rechazan',async()=>{
    const c=await nueva();c.payment.external_reference=randomUUID();c.order.external_reference=c.payment.external_reference;
    assert.equal((await notify(c)).status,200);assert.equal(await pagoRow(c),null);
    const bad=await nueva({paymentChanges:{transaction_amount:220000.501}});assert.equal((await notify(bad)).status,502);assert.equal(await pagoRow(bad),null);
    bad.payment.id=Number.MAX_SAFE_INTEGER+1;assert.equal((await notify(bad)).status,503);
  });
});
