import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
process.env.NODE_ENV='test';process.env.COOKIE_SECURE='false';process.env.FRONTEND_URL='http://127.0.0.1:5173';
process.env.ALLOWED_ORIGINS='http://127.0.0.1:5173';process.env.MP_HABILITADO='true';process.env.MP_MODO='PRUEBA';
process.env.MP_ACCESS_TOKEN='TEST-ficticio-reconciliacion';process.env.MP_COLLECTOR_ID='123456';
process.env.MP_FRONTEND_URL='https://front.example.invalid';process.env.MP_NOTIFICATION_URL='https://back.example.invalid/api/mercadopago/webhook';
const {default:db}=await import('../src/DataBase/db.js');
const {modelos}=await import('../src/Models/index.js');
const {crearCompra}=await import('../src/Services/Compra/compra.service.js');
const {reconciliarCompra}=await import('../src/Services/Compra/reconciliacionCompra.service.js');
const {crearCheckout}=await import('../src/Services/Compra/checkout.service.js');
const {conectarPrueba}=await import('./adapter-crm.js');
const {fecha}=await import('../src/Services/Pago/mercadoPago.service.js');

test('Reconciliación: recupera preferencias y pagos mediante GET, sin generar otro cobro',async t=>{
  const adapter=await conectarPrueba(db,{fixture:'campus.sqlite.sql'}),originalFetch=global.fetch;
  const tasks=new Map(),preferences=new Map(),payments=new Map(),orders=new Map();
  const paths=[];let seq=2000,offline=false,prefResponse='ok',searchMode='ok',failPayment=null,hold=null;
  global.fetch=async(url,options)=>{
    const target=new URL(url);paths.push({path:target.pathname,method:options.method});
    assert.equal(target.origin,'https://api.mercadopago.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer TEST-ficticio-reconciliacion');
    if(offline)throw new Error('Fallo externo simulado');
    const ref=target.searchParams.get('external_reference'),task=tasks.get(ref);
    let body,status=200;
    if(target.pathname==='/checkout/preferences/search') {
      if(hold)await hold;
      const ids=task.preferenceIds;
      body={total:ids.length,elements:ids.slice(0,2).map(id=>({id}))};
      if(prefResponse==='incomplete')body={total:1,elements:[]};
    } else if(target.pathname.startsWith('/checkout/preferences/'))body=preferences.get(target.pathname.split('/').at(-1));
    else if(target.pathname==='/v1/payments/search') {
      const offset=Number(target.searchParams.get('offset')),limit=100;
      assert.equal(target.searchParams.get('sort'),'date_created');assert.equal(target.searchParams.get('criteria'),'asc');
      assert.ok(target.searchParams.has('begin_date'));assert.ok(target.searchParams.has('end_date'));
      const ids=task.paymentIds;
      body={paging:{total:ids.length,limit,offset},results:ids.slice(offset,offset+limit).map(id=>({id,external_reference:ref,status:'approved'}))};
      if(searchMode==='incomplete')body.results=[];
      if(searchMode==='otherref' && body.results.length)body.results[0].external_reference=randomUUID();
    } else if(target.pathname.startsWith('/v1/payments/')) {
      const id=target.pathname.split('/').at(-1);body=payments.get(id);if(id===failPayment)status=503;
    } else if(target.pathname.startsWith('/merchant_orders/'))body=orders.get(target.pathname.split('/').at(-1));
    else throw new Error('Endpoint inesperado: '+target.pathname);
    return new Response(JSON.stringify(body||{}),{status:body?status:404,headers:{'content-type':'application/json'}});
  };
  t.after(async()=>{global.fetch=originalFetch;await adapter.close();});
  const admin=await modelos.usuarios.create({nombre:'Juan prueba',email:'reconciliar@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:'fixture'});
  const course=await modelos.cursos.create({titulo:'Kit Emprendedor',slug:'kit-reconciliar',precio:'220000.50',estado:'PUBLICADO',visible_catalogo:1,venta_online_habilitada:1,creado_por:admin.id});
  async function nueva({state='INCIERTA',known=false,pagos=1}={}) {
    const referencia=randomUUID(),token=randomBytes(32).toString('hex');
    await crearCompra({referencia,nombre:'Comprador prueba',email:'comprador@example.invalid',curso_ids:[course.id]},token);
    const compra=await modelos.compras.findOne({where:{referencia}}),prefId='pref-'+(++seq),orderId=String(seq+10000),paymentIds=[];
    // Benjamin Orellana - 18/10/2026 - Recuperar el formato devuelto por el sandbox argentino.
    const url='https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id='+prefId;
    await compra.update({mp_preferencia_estado:known?'DISPONIBLE':state,mp_preferencia_id:known?prefId:null,mp_checkout_url:known?url:null,mp_error_codigo:state==='INCIERTA'?'MP_RESULTADO_INCIERTO':null});
    const pref={id:prefId,collector_id:123456,external_reference:referencia,expires:true,
      expiration_date_from:fecha(compra.creado_en).toISOString(),expiration_date_to:fecha(compra.vence_en).toISOString(),
      sandbox_init_point:url,items:[{id:String(course.id),currency_id:'ARS',quantity:1,unit_price:220000.5}]};
    preferences.set(prefId,pref);
    const approval=new Date(fecha(compra.creado_en).getTime()+100).toISOString(),updated=new Date(fecha(compra.creado_en).getTime()+200).toISOString();
    for(let i=0;i<pagos;i++) {
      const id=String(++seq);paymentIds.push(id);
      payments.set(id,{id,collector_id:123456,live_mode:false,external_reference:referencia,order:{id:orderId,type:'mercadopago'},
        status:i===0?'approved':'rejected',status_detail:i===0?'accredited':'cc_rejected_other_reason',
        transaction_amount:220000.5,transaction_amount_refunded:0,currency_id:'ARS',
        date_approved:i===0?approval:null,date_last_updated:updated});
    }
    orders.set(orderId,{id:orderId,collector:{id:123456},external_reference:referencia,preference_id:prefId,payments:paymentIds.map(id=>({id}))});
    const task={compra,prefId,pref,paymentIds,preferenceIds:[prefId],token,referencia};tasks.set(referencia,task);return task;
  }
  const auditCount=(c,accion)=>modelos.auditoria_eventos.count({where:{entidad:'compras',entidad_id:c.compra.id,accion}});
  await t.test('Sin intento enviado no contacta MP; configuración ausente no toca una preferencia incierta',async()=>{
    const c=await nueva({state:'SIN_CREAR',pagos:0}),before=paths.length;
    process.env.MP_HABILITADO='false';const summary=await reconciliarCompra(c.referencia);assert.equal(summary.sin_intento_enviado,true);assert.equal(paths.length,before);
    const failed=await nueva();await assert.rejects(reconciliarCompra(failed.referencia),e=>e.code==='MP_NO_CONFIGURADO');
    await failed.compra.reload();assert.equal(failed.compra.mp_preferencia_estado,'INCIERTA');process.env.MP_HABILITADO='true';
  });
  let recovered;
  await t.test('Respuesta perdida recupera la preferencia exacta y confirma un pago sin webhook',async()=>{
    recovered=await nueva();const result=await reconciliarCompra(recovered.referencia);
    assert.equal(result.preferencia_recuperada,true);assert.equal(result.estado,'PAGADA');assert.equal(result.pagos_consultados,1);assert.equal(result.completa,true);
    assert.equal(await auditCount(recovered,'MP_PREFERENCIA_RECUPERADA'),1);assert.equal(await auditCount(recovered,'COMPRA_PAGADA'),1);
    const again=await reconciliarCompra(recovered.referencia);assert.equal(again.preferencia_recuperada,false);
    assert.equal(await auditCount(recovered,'MP_PREFERENCIA_RECUPERADA'),1);assert.equal(await auditCount(recovered,'COMPRA_PAGADA'),1);
    assert.equal(await modelos.usuarios.count(),1);assert.equal(await modelos.crm_clientes.count(),0);assert.equal(await modelos.curso_accesos.count(),0);
  });
  await t.test('Cero, varias preferencias o respuesta incompleta no habilitan ni reintentan creación',async()=>{
    for(const type of ['zero','many','incomplete']) {
      const c=await nueva();if(type==='zero')c.preferenceIds=[];if(type==='many')c.preferenceIds.push('pref-extra');if(type==='incomplete')prefResponse='incomplete';
      await assert.rejects(reconciliarCompra(c.referencia));prefResponse='ok';await c.compra.reload();assert.equal(c.compra.mp_preferencia_estado,'INCIERTA');assert.equal(c.compra.mp_preferencia_id,null);
      await assert.rejects(crearCheckout(c.referencia,c.token),e=>e.code==='MP_CONFIRMACION_PENDIENTE');
    }
  });
  await t.test('Preferencia manipulada: vendedor, importe, plazo y link se contrastan',async()=>{
    for(const type of ['seller','price','expiry','url','course']) {
      const c=await nueva();
      if(type==='seller')c.pref.collector_id=999;
      if(type==='price')c.pref.items[0].unit_price=1;
      if(type==='expiry')c.pref.expiration_date_to=new Date(Date.now()+86400000).toISOString();
      if(type==='url')c.pref.sandbox_init_point='https://ajeno.example.invalid/';
      if(type==='course')c.pref.items[0].id='999';
      await assert.rejects(reconciliarCompra(c.referencia));await c.compra.reload();assert.equal(c.compra.mp_preferencia_id,null);assert.equal(c.compra.estado,'PENDIENTE');
    }
  });
  await t.test('Más de 100 pagos se paginan y cada ID se verifica; Search.status no confirma',async()=>{
    const c=await nueva({known:true,pagos:111});payments.get(c.paymentIds[0]).status='pending';payments.get(c.paymentIds[0]).status_detail='pending_waiting_payment';payments.get(c.paymentIds[0]).date_approved=null;
    const result=await reconciliarCompra(c.referencia);assert.equal(result.pagos_consultados,111);assert.equal(result.pagos_registrados,111);assert.equal(result.estado,'PENDIENTE');assert.equal(result.completa,true);
  });
  await t.test('Una búsqueda incompleta o de otra referencia no aplica confirmaciones parciales',async()=>{
    for(const mode of ['incomplete','otherref']) {
      const c=await nueva({known:true});searchMode=mode;await assert.rejects(reconciliarCompra(c.referencia));searchMode='ok';
      assert.equal(await modelos.compra_pagos.count({where:{compra_id:c.compra.id}}),0);await c.compra.reload();assert.equal(c.compra.estado,'PENDIENTE');
    }
  });
  await t.test('Fallo de un pago conserva los confirmados y devuelve revisión incompleta; reintento recupera',async()=>{
    const c=await nueva({known:true,pagos:2});failPayment=c.paymentIds[1];
    const partial=await reconciliarCompra(c.referencia);assert.equal(partial.completa,false);assert.equal(partial.estado,'PAGADA');assert.equal(partial.pagos_consultados,1);assert.equal(partial.errores.length,1);
    failPayment=null;assert.equal((await reconciliarCompra(c.referencia)).completa,true);assert.equal(await auditCount(c,'COMPRA_PAGADA'),1);
  });
  await t.test('Pago conocido se revisa aunque Search no lo devuelva; detecta reintegro y guarda incidencia',async()=>{
    recovered.paymentIds=[];const known=(await modelos.compra_pagos.findAll({where:{compra_id:recovered.compra.id}}))[0];
    const payment=payments.get(String(known.mp_pago_id));payment.transaction_amount_refunded=50;payment.date_last_updated=new Date(Date.parse(payment.date_last_updated)+1000).toISOString();
    const result=await reconciliarCompra(recovered.referencia);assert.equal(result.pagos_consultados,1);assert.equal(result.pagos_en_revision,1);assert.equal(result.estado,'PAGADA');
  });
  await t.test('Respuesta de detalle con otra referencia no modifica ninguna de las dos compras',async()=>{
    const a=await nueva({known:true}),b=await nueva({known:true,pagos:0});payments.get(a.paymentIds[0]).external_reference=b.referencia;
    const order=orders.get(String(payments.get(a.paymentIds[0]).order.id));order.external_reference=b.referencia;
    const result=await reconciliarCompra(a.referencia);assert.equal(result.completa,false);
    for(const c of [a,b]){await c.compra.reload();assert.equal(c.compra.estado,'PENDIENTE');assert.equal(await modelos.compra_pagos.count({where:{compra_id:c.compra.id}}),0);}
  });
  await t.test('Proveedor caído, referencia inválida o compra desconocida no generan operaciones',async()=>{
    const c=await nueva();offline=true;await assert.rejects(reconciliarCompra(c.referencia));offline=false;
    await assert.rejects(reconciliarCompra('../../ruta'),e=>e.code==='COMPRA_INVALIDA');await assert.rejects(reconciliarCompra(randomUUID()),e=>e.code==='COMPRA_NO_ENCONTRADA');
    await c.compra.reload();assert.equal(c.compra.mp_preferencia_estado,'INCIERTA');
  });
  await t.test('Auditoría fallida revierte la recuperación de preferencia y evita pago parcial',async()=>{
    const c=await nueva(),original=modelos.auditoria_eventos.create;modelos.auditoria_eventos.create=async()=>{throw new Error('Auditoría aislada');};
    try{await assert.rejects(reconciliarCompra(c.referencia));}finally{modelos.auditoria_eventos.create=original;}
    await c.compra.reload();assert.equal(c.compra.mp_preferencia_id,null);assert.equal(await modelos.compra_pagos.count({where:{compra_id:c.compra.id}}),0);
  });
  await t.test('Una revisión en curso bloquea otra en el mismo proceso y libera después',async()=>{
    const c=await nueva({pagos:0});let release;hold=new Promise(resolve=>{release=resolve;});
    const first=reconciliarCompra(c.referencia);await new Promise(resolve=>setTimeout(resolve,10));
    await assert.rejects(reconciliarCompra(c.referencia),e=>e.code==='MP_RECONCILIACION_EN_CURSO');release();hold=null;assert.equal((await first).completa,true);
  });
  await t.test('Respuesta original tardía acepta el mismo link recuperado sin duplicar auditoría',async()=>{
    const c=await nueva({state:'SIN_CREAR',pagos:0}),readFetch=global.fetch;
    let entered,release;const started=new Promise(resolve=>{entered=resolve;});const wait=new Promise(resolve=>{release=resolve;});
    let initialPosts=0;
    global.fetch=async(url,options)=>{
      if(url==='https://api.mercadopago.com/checkout/preferences' && options.method==='POST') {
        initialPosts++;entered();await wait;
        return new Response(JSON.stringify({id:c.prefId,sandbox_init_point:c.pref.sandbox_init_point}),{headers:{'content-type':'application/json'}});
      }
      return readFetch(url,options);
    };
    try {
      const first=crearCheckout(c.referencia,c.token);await started;
      assert.equal((await reconciliarCompra(c.referencia)).preferencia_recuperada,true);release();
      assert.equal((await first).id,c.prefId);assert.equal(initialPosts,1);
      await c.compra.reload();assert.equal(c.compra.mp_preferencia_estado,'DISPONIBLE');
      assert.equal(await auditCount(c,'MP_PREFERENCIA_RECUPERADA'),1);assert.equal(await auditCount(c,'MP_PREFERENCIA_CREADA'),0);
    } finally {release();global.fetch=readFetch;}
  });
  await t.test('CLI rechaza argumentos libres antes de abrir DB',()=>{
    const result=spawnSync(process.execPath,['Scripts/reconciliar-compra.js','--referencia','../../ruta'],{encoding:'utf8'});
    assert.equal(result.status,1);assert.match(result.stderr,/Uso:/);assert.ok(!result.stderr.includes('MP_ACCESS_TOKEN'));
  });
  assert.ok(paths.every(row=>row.method==='GET'));
});
