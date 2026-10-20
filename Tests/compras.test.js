import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import { conectarPrueba } from './adapter-crm.js';
import { crearCompra, obtenerCompra, cancelarCompra } from '../src/Services/Compra/compra.service.js';

test('Compras: importes y condiciones preservados, reintentos y privacidad en SQLite aislado',async t=>{
  const adapter=await conectarPrueba(db,{fixture:'campus.sqlite.sql'});t.after(()=>adapter.close());
  const admin=await modelos.usuarios.create({nombre:'Juan prueba',email:'compras@example.invalid',rol:'ADMIN',estado:'ACTIVO',password_hash:'fixture'});
  const course=await modelos.cursos.create({titulo:'Kit prueba',slug:'kit-prueba',precio:'220000.50',moneda:'ARS',estado:'PUBLICADO',visible_catalogo:1,venta_online_habilitada:1,creado_por:admin.id});
  const other=await modelos.cursos.create({titulo:'Otro',slug:'otro',precio:'0.10',estado:'PUBLICADO',visible_catalogo:1,venta_online_habilitada:1,creado_por:admin.id,acceso_duracion_cantidad:45,acceso_duracion_unidad:'DIAS'});
  const ref=randomUUID(),token=randomBytes(32).toString('hex'),body={referencia:ref,nombre:' Comprador prueba ',email:'COMPRADOR@EXAMPLE.INVALID',curso_ids:[String(other.id),String(course.id)]};
  let initial;

  await t.test('Compra pendiente: precio de DB, total exacto y 15 minutos, sin cuenta ni acceso',async()=>{
    initial=await crearCompra(body,token);assert.equal(initial.total,'220000.60');assert.equal(initial.estado_temporal,'PENDIENTE');assert.equal(initial.reutilizada,false);
    assert.equal(initial.items[0].curso_id,String(course.id));assert.equal(initial.items[0].acceso_duracion_cantidad,1);assert.equal(initial.items[1].acceso_duracion_unidad,'DIAS');
    const row=await modelos.compras.scope('conHash').findOne({where:{referencia:ref}});
    const created=new Date(row.creado_en.replace(' ','T')+'Z');assert.equal(new Date(initial.vence_en)-created,900000);
    assert.equal(row.comprador_email,'comprador@example.invalid');assert.equal(row.usuario_id,null);assert.notEqual(row.token_hash,token);
    assert.equal(await modelos.usuarios.count(),1);assert.equal(await modelos.curso_accesos.count(),0);
    assert.ok(!JSON.stringify(initial).includes('hash'));assert.ok(!JSON.stringify(initial).includes(token));
    assert.ok(!Object.hasOwn((await modelos.compras.findByPk(row.id)).get(),'token_hash'));
  });
  await t.test('Reintento tras editar curso conserva precio, texto y duración, sin duplicar auditoría',async()=>{
    await course.update({precio:'300000.00',titulo:'Título nuevo',acceso_duracion_cantidad:3});
    const again=await crearCompra({...body,curso_ids:[String(course.id),String(other.id)]},token);
    assert.equal(again.reutilizada,true);assert.equal(again.total,initial.total);assert.equal(again.items[0].titulo,'Kit prueba');assert.equal(again.items[0].acceso_duracion_cantidad,1);
    assert.equal(await modelos.compras.count(),1);assert.equal(await modelos.compra_items.count(),2);
    assert.equal(await modelos.auditoria_eventos.count({where:{accion:'COMPRA_CREADA'}}),1);
    const newPurchase=await crearCompra({...body,referencia:randomUUID(),curso_ids:[String(course.id)]},randomBytes(32).toString('hex'));
    assert.equal(newPurchase.total,'300000.00');assert.equal(newPurchase.items[0].acceso_duracion_cantidad,3);
  });
  await t.test('Referencia sola no identifica comprador; no acepta precio, estado ni usuario libres',async()=>{
    const fails=(fn,code)=>assert.rejects(fn,e=>e.code===code);
    await fails(()=>obtenerCompra(ref,randomBytes(32).toString('hex')),'COMPRA_NO_ENCONTRADA');
    await fails(()=>crearCompra({...body,nombre:'Otro comprador'},token),'COMPRA_REINTENTO_DISTINTO');
    for(const extra of [{total:'1.00'},{estado:'PAGADA'},{usuario_id:admin.id},{vence_en:'2030-01-01'}])await fails(()=>crearCompra({...body,...extra},token),'CAMPO_NO_PERMITIDO');
    await fails(()=>crearCompra({...body,referencia:randomUUID(),curso_ids:[course.id,course.id]},token),'COMPRA_INVALIDA');
    await fails(()=>crearCompra({...body,referencia:randomUUID(),email:''},token),'COMPRA_INVALIDA');
    await fails(()=>crearCompra({...body,referencia:randomUUID(),curso_ids:['01']},token),'ID_INVALIDO');
  });
  await t.test('Borrador, oculto, venta deshabilitada, sin precio, USD o inexistente no generan compra parcial',async()=>{
    const count=await modelos.compras.count(),items=await modelos.compra_items.count();
    for(const patch of [{estado:'BORRADOR'},{visible_catalogo:0},{venta_online_habilitada:0},{precio:null},{precio:'0.00'},{moneda:'USD'}]){
      await course.update({estado:'PUBLICADO',visible_catalogo:1,venta_online_habilitada:1,precio:'220000.00',moneda:'ARS',...patch});
      await assert.rejects(()=>crearCompra({...body,referencia:randomUUID()},token),e=>e.code==='CURSO_NO_COMPRABLE');
    }
    await assert.rejects(()=>crearCompra({...body,referencia:randomUUID(),curso_ids:['999']},token),e=>e.code==='CURSO_NO_COMPRABLE');
    assert.equal(await modelos.compras.count(),count);assert.equal(await modelos.compra_items.count(),items);
    await course.update({moneda:'ARS',precio:'220000.00'});
  });
  await t.test('Vencimiento calculado y cancelación idempotente no habilitan cursos',async()=>{
    const row=await modelos.compras.findOne({where:{referencia:ref}});
    await row.update({creado_en:new Date(Date.now()-120000),vence_en:new Date(Date.now()-60000)});
    assert.equal((await obtenerCompra(ref,token)).estado_temporal,'VENCIDA');
    assert.equal((await crearCompra(body,token)).estado_temporal,'VENCIDA');
    assert.equal((await cancelarCompra(ref,token)).estado,'CANCELADA');await cancelarCompra(ref,token);
    assert.equal(await modelos.auditoria_eventos.count({where:{accion:'COMPRA_CANCELADA'}}),1);
    assert.equal(await modelos.curso_accesos.count(),0);
  });
  await t.test('La auditoría fallida revierte compra e items completos',async()=>{
    const original=modelos.auditoria_eventos.create,count=await modelos.compras.count(),items=await modelos.compra_items.count();
    modelos.auditoria_eventos.create=async()=>{throw new Error('Fallo controlado de auditoría');};
    try{await assert.rejects(()=>crearCompra({...body,referencia:randomUUID()},token),/Fallo controlado/);}finally{modelos.auditoria_eventos.create=original;}
    assert.equal(await modelos.compras.count(),count);assert.equal(await modelos.compra_items.count(),items);
  });
});
