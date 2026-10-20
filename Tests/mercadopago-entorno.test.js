/* Benjamin Orellana - 18/10/2026 - No confundir un indicador live_mode con la clasificación verificada del vendedor. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarPagoMP } from '../src/Services/Pago/consultaPago.service.js';

test('live_mode=true exige DESA, modo PRUEBA, vendedor exacto y etiqueta remota test_user',async t=>{
  const previous=Object.fromEntries(['NODE_ENV','MP_MODO','MP_HABILITADO'].map(key=>[key,process.env[key]]));
  t.after(()=>{for(const [key,value] of Object.entries(previous)) {
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }});
  process.env.NODE_ENV='development';process.env.MP_MODO='PRUEBA';process.env.MP_HABILITADO='true';
  const config={token:'credencial-ficticia',collector:'123456'};
  let live=true,profile={id:123456,site_id:'MLA',tags:['test_user']};const calls=[];
  const payment={id:1,collector_id:123456,external_reference:'compra-de-prueba',order:{id:2,type:'mercadopago'},
    status:'approved',status_detail:'accredited',currency_id:'ARS',transaction_amount:350000,transaction_amount_refunded:0,
    date_approved:'2026-10-18T22:41:00.000+00:00',date_last_updated:'2026-10-18T22:41:00.100+00:00'};
  const fake=async(url,options)=>{
    calls.push(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.headers.Authorization,'Bearer '+config.token);assert(options.signal);
    let body;
    if(url==='https://api.mercadopago.com/v1/payments/1')body={...payment,live_mode:live};
    else if(url==='https://api.mercadolibre.com/users/me')body=profile;
    else if(url==='https://api.mercadopago.com/merchant_orders/2')body={id:2,collector:{id:123456},external_reference:payment.external_reference,
      preference_id:'pref-1',payments:[{id:1}]};
    else assert.fail('URL externa inesperada');
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };
  await t.test('Acepta el dueño test_user exacto y no devuelve su perfil privado',async()=>{
    const result=await consultarPagoMP('1',config,fake);
    assert.equal(result.importe,'350000.00');assert.equal(result.estado,'approved');assert.equal(result.preferenciaId,'pref-1');
    assert(!JSON.stringify(result).includes('test_user'));assert.equal(calls.length,3);
  });
  await t.test('Producción y modo incorrecto bloquean antes de consultar el perfil',async()=>{
    for(const [key,value] of [['NODE_ENV','production'],['MP_MODO','PRODUCCION'],['MP_HABILITADO','false']]) {
      const old=process.env[key],before=calls.length;process.env[key]=value;
      try {await assert.rejects(consultarPagoMP('1',config,fake),{code:'MP_ENTORNO_NO_VERIFICADO'});assert.equal(calls.length,before+1);}
      finally {process.env[key]=old;}
    }
  });
  await t.test('Etiqueta ausente, ID distinto y país distinto se rechazan',async()=>{
    for(const owner of [{id:123456,site_id:'MLA',tags:[]},{id:999,site_id:'MLA',tags:['test_user']},
      {id:123456,site_id:'MLB',tags:['test_user']}]) {
      profile=owner;await assert.rejects(consultarPagoMP('1',config,fake),{code:'MP_ENTORNO_NO_VERIFICADO'});
    }
  });
  await t.test('Un booleano false conserva el flujo anterior; texto true no autentica un entorno',async()=>{
    live=false;const before=calls.length;await consultarPagoMP('1',config,fake);assert.equal(calls.length,before+2);
    live='true';await assert.rejects(consultarPagoMP('1',config,fake),{code:'MP_PAGO_NO_VERIFICADO'});
  });
});
