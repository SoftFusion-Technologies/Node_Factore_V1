import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/DataBase/db.js';
import { modelos } from '../src/Models/index.js';
import * as Clientes from '../src/Controllers/Cliente/CTS_TB_Clientes.js';
import * as Notas from '../src/Controllers/Cliente/CTS_TB_ClientesNotas.js';
import * as Comercios from '../src/Controllers/Comercio/CTS_TB_ComerciosAmigos.js';
import * as Vinculos from '../src/Controllers/Comercio/CTS_TB_ComercioClientes.js';
import { conectarPrueba } from './adapter-crm.js';
import { id, bandera } from '../src/utils/validacion.utils.js';
import { serializar } from '../src/utils/http.utils.js';

test('CRM: controladores y SQL Sequelize con SQLite aislado, sin MySQL DESA', async t => {
  const adapter = await conectarPrueba(db);
  t.after(() => adapter.close());
  const admin = await modelos.usuarios.create({ nombre:'Admin de prueba',email:'admin@example.invalid',
    password_hash:'HASH_PRIVADO_NO_PUBLICAR',rol:'ADMIN',estado:'ACTIVO' });
  const blocked = await modelos.usuarios.create({ nombre:'Admin bloqueado',email:'bloqueado@example.invalid',rol:'ADMIN',estado:'BLOQUEADO' });
  async function call(handler, { user = { id:admin.id }, params = {}, query = {}, body } = {}) {
    const response = { statusCode:200, value:null, status(code) { this.statusCode = code; return this; },
      json(value) { this.value = JSON.parse(JSON.stringify(value)); return this; } };
    await handler({ user, params, query, body }, response);
    return response;
  }
  function ok(result, status = 200) {
    assert.equal(result.statusCode, status, JSON.stringify(result.value));
    return result.value.data;
  }
  let client, secondClient, student, comercio, anotherCommerce, note, link;

  await t.test('Sesión obligatoria, cuenta activa y rol consultado desde la base', async () => {
    ok(await call(Clientes.OBRS_Clientes_CTS, { user:null }), 401);
    ok(await call(Clientes.OBRS_Clientes_CTS, { user:{id:blocked.id,rol:'ADMIN',estado:'ACTIVO'} }), 401);
    ok(await call(Clientes.OBRS_Clientes_CTS, { user:{id:'999999',rol:'ADMIN'} }), 401);
  });
  await t.test('Ficha sin cuenta, auditoría y campos opcionales nulos', async () => {
    client = ok(await call(Clientes.CR_Cliente_CTS, { body:{nombre:'Juan Cliente',email:'CLIENTE@EXAMPLE.INVALID',telefono:''} }), 201);
    assert.equal(client.email, 'cliente@example.invalid');assert.equal(client.telefono, null);
    assert.match(client.creado_en, /Z$/);assert.equal(typeof client.id, 'string');
    const detail = ok(await call(Clientes.OBRS_DetCliente_CTS, { params:{id:client.id} }));
    assert.equal(detail.usuario, null);
    assert.equal(await modelos.usuarios.count({ where:{cliente_id:client.id} }), 0);
    assert.equal(await modelos.auditoria_eventos.count({ where:{accion:'CLIENTE_CREADO'} }), 1);
    secondClient = ok(await call(Clientes.CR_Cliente_CTS, { body:{tipo:'EMPRESA',nombre:'Empresa de prueba',razon_social:'Empresa S.A.'} }), 201);
    student = await modelos.usuarios.create({ nombre:'Alumno',email:'alumno@example.invalid',rol:'ALUMNO',estado:'ACTIVO',cliente_id:client.id,password_hash:'HASH_PRIVADO_NO_PUBLICAR' });
    ok(await call(Clientes.OBRS_Clientes_CTS, { user:{id:student.id,rol:'ADMIN'} }), 403);
  });
  await t.test('Validación, asignación masiva rechazada y BIGINT sin redondeo', async () => {
    for (const body of [{nombre:''},{nombre:'X',password_hash:'x'},{nombre:'X',activo:'false'},{nombre:'X',estado_comercial:'OTRO'},{nombre:'X',email:'mal'}]) {
      ok(await call(Clientes.CR_Cliente_CTS, { body }), 422);
    }
    ok(await call(Clientes.UR_Cliente_CTS, { params:{id:client.id},body:{} }), 422);
    ok(await call(Clientes.OBRS_DetCliente_CTS, { params:{id:'1 OR 1=1'} }), 422);
    ok(await call(Clientes.OBRS_DetCliente_CTS, { params:{id:'18446744073709551615'} }), 404);
    assert.equal(id('18446744073709551615'), '18446744073709551615');
    assert.throws(() => id(9007199254740992));assert.throws(() => id('18446744073709551616'));
    assert.equal(bandera(false, 'activo'), 0);assert.throws(() => bandera('false', 'activo'));
    const fecha = '2026-10-04 12:13:14.001';
    assert.deepEqual(serializar({contenido:fecha,creado_en:fecha}), {contenido:fecha,creado_en:'2026-10-04T12:13:14.001Z'});
  });
  await t.test('111 clientes completos, filtros, búsqueda y paginación explícita', async () => {
    for (let n = 0; n < 109; n++) await modelos.crm_clientes.create({nombre:`Cliente ${String(n).padStart(3,'0')}`});
    const all = await call(Clientes.OBRS_Clientes_CTS);assert.equal(ok(all).length, 111);
    assert.deepEqual(all.value.meta, {paginado:false,total:111});
    assert.equal(ok(await call(Clientes.OBRS_Clientes_CTS, { query:{q:'   '} })).length, 111);
    const filtered = await call(Clientes.OBRS_Clientes_CTS, { query:{tipo:'EMPRESA'} });assert.equal(ok(filtered).length, 1);
    const page = await call(Clientes.OBRS_Clientes_CTS, { query:{pagina:'2',por_pagina:'10'} });assert.equal(ok(page).length, 10);
    assert.equal(page.value.meta.total, 111);assert.equal(page.value.meta.total_paginas, 12);
    assert.equal(ok(await call(Clientes.OBRS_Clientes_CTS, { query:{q:'Juan Cliente'} })).length, 1);
    assert.equal(ok(await call(Clientes.OBRS_Clientes_CTS, { query:{q:"x' OR 1=1 --"} })).length, 0);
    for (const query of [{por_pagina:'0'},{por_pagina:'501'},{ordenar_por:'password_hash'},{direccion:'ASC; DROP TABLE usuarios'},{limit:'100'},{q:['X']}]) {
      ok(await call(Clientes.OBRS_Clientes_CTS, { query }), 422);
    }
    assert.ok(!JSON.stringify(all.value).includes('HASH_PRIVADO_NO_PUBLICAR'));
  });
  await t.test('Edición parcial conserva campos y permite limpiarlos con null', async () => {
    const row = ok(await call(Clientes.UR_Cliente_CTS, { params:{id:client.id},body:{rubro:'Consultoría',email:null} }));
    assert.equal(row.nombre, 'Juan Cliente');assert.equal(row.email, null);assert.equal(row.rubro, 'Consultoría');
    ok(await call(Clientes.UR_Cliente_CTS, { params:{id:client.id},body:{activo:1,estado_comercial:'INACTIVO'} }), 422);
  });
  await t.test('Notas privadas: autor de sesión, CRUD y aislamiento entre clientes', async () => {
    note = ok(await call(Notas.CR_ClienteNota_CTS, { params:{cliente_id:client.id},body:{contenido:'Seguimiento privado de Juan.'} }), 201);
    assert.equal(note.creado_por, String(admin.id));assert.equal(note.autor.nombre, 'Admin de prueba');
    ok(await call(Notas.CR_ClienteNota_CTS, { params:{cliente_id:client.id},body:{contenido:'X',creado_por:student.id} }), 422);
    ok(await call(Notas.OBRS_ClientesNotas_CTS, { user:{id:student.id},params:{cliente_id:client.id} }), 403);
    ok(await call(Notas.UR_ClienteNota_CTS, { params:{id:note.id,cliente_id:secondClient.id},body:{contenido:'Otro'} }), 404);
    const edited = ok(await call(Notas.UR_ClienteNota_CTS, { params:{id:note.id,cliente_id:client.id},body:{contenido:'Seguimiento actualizado.'} }));
    assert.equal(edited.creado_por, String(admin.id));
    assert.equal(ok(await call(Notas.OBRS_ClientesNotas_CTS, { params:{cliente_id:client.id} })).length, 1);
    ok(await call(Notas.CR_ClienteNota_CTS, { params:{cliente_id:client.id},body:{contenido:'💬'.repeat(16000)} }), 422);
  });
  await t.test('Comercios: slug, URLs, valores por defecto y campos de archivos reservados', async () => {
    comercio = ok(await call(Comercios.CR_ComercioAmigo_CTS, { body:{nombre:'Comercio Amigo Ñ',observaciones_internas:'Contacto comercial privado'} }), 201);
    assert.equal(comercio.slug, 'comercio-amigo-n');assert.equal(comercio.mostrar_a_usuarios, 0);
    anotherCommerce = ok(await call(Comercios.CR_ComercioAmigo_CTS, { body:{nombre:'Otro comercio'} }), 201);
    ok(await call(Comercios.CR_ComercioAmigo_CTS, { body:{nombre:'Otro nombre',slug:comercio.slug} }), 409);
    for (const body of [{web_url:'javascript:alert(1)'},{web_url:'https://usuario:clave@example.invalid'},{logo_archivo_id:'1'},{mostrar_a_usuarios:'false'},{orden:-1}]) {
      ok(await call(Comercios.UR_ComercioAmigo_CTS, { params:{id:comercio.id},body }), 422);
    }
    const edited = ok(await call(Comercios.UR_ComercioAmigo_CTS, { params:{id:comercio.id},body:{mostrar_a_usuarios:true,web_url:'https://example.invalid'} }));
    assert.equal(edited.mostrar_a_usuarios, 1);assert.equal(edited.web_url, 'https://example.invalid/');
    assert.equal(ok(await call(Comercios.OBRS_ComerciosAmigos_CTS, { query:{mostrar_a_usuarios:'true'} })).length, 1);
    ok(await call(Comercios.OBRS_ComerciosAmigos_CTS, { user:{id:student.id} }), 403);
  });
  await t.test('Vincular cliente sin cuenta, evitar duplicados y conservar su función', async () => {
    link = ok(await call(Vinculos.CR_ComercioCliente_CTS, { params:{comercio_id:comercio.id},body:{cliente_id:secondClient.id,funcion:'Contacto'} }), 201);
    assert.equal(link.cliente.nombre, 'Empresa de prueba');
    ok(await call(Vinculos.CR_ComercioCliente_CTS, { params:{comercio_id:comercio.id},body:{cliente_id:secondClient.id} }), 409);
    assert.equal(ok(await call(Vinculos.OBRS_ClientesComercio_CTS, { params:{comercio_id:comercio.id} })).length, 1);
    assert.equal(ok(await call(Vinculos.OBRS_ComerciosCliente_CTS, { params:{cliente_id:secondClient.id} })).length, 1);
    const edited = ok(await call(Vinculos.UR_ComercioCliente_CTS, { params:{id:link.id,comercio_id:comercio.id},body:{funcion:null} }));
    assert.equal(edited.funcion, null);
    ok(await call(Vinculos.ER_ComercioCliente_CTS, { params:{id:link.id,comercio_id:anotherCommerce.id} }), 404);
    ok(await call(Vinculos.ER_ComercioCliente_CTS, { params:{id:link.id,comercio_id:comercio.id} }));
    assert.ok(await modelos.crm_clientes.findByPk(secondClient.id));
  });
  await t.test('Desactivación de comercio conserva historial y oculta su presentación', async () => {
    const row = ok(await call(Comercios.ER_ComercioAmigo_CTS, { params:{id:comercio.id} }));
    assert.equal(row.activo, 0);assert.equal(row.mostrar_a_usuarios, 1);
    assert.equal(await modelos.comercios_amigos.count({where:{activo:1,mostrar_a_usuarios:1}}), 0);
    ok(await call(Vinculos.CR_ComercioCliente_CTS, { params:{comercio_id:comercio.id},body:{cliente_id:secondClient.id} }), 409);
    ok(await call(Comercios.UR_ComercioAmigo_CTS, { params:{id:comercio.id},body:{activo:true} }));
  });
  await t.test('Desactivación de cliente revoca sesiones y tokens dentro de la transacción', async () => {
    await modelos.usuarios_sesiones.create({usuario_id:student.id,token_hash:'a'.repeat(64),vence_en:new Date('2027-10-01T00:00:00Z')});
    await modelos.usuarios_tokens.create({usuario_id:student.id,tipo:'ACTIVACION',token_hash:'b'.repeat(64),vence_en:new Date('2027-10-01T00:00:00Z')});
    const row = ok(await call(Clientes.ER_Cliente_CTS, { params:{id:client.id} }));
    assert.equal(row.activo, 0);assert.equal(row.estado_comercial, 'INACTIVO');
    const session = await modelos.usuarios_sesiones.findOne({where:{usuario_id:student.id}});
    const token = await modelos.usuarios_tokens.findOne({where:{usuario_id:student.id}});
    assert.ok(session.revocada_en);assert.ok(token.revocado_en);
    assert.ok(await modelos.clientes_notas.findByPk(note.id));
    assert.equal(await modelos.crm_clientes.count(), 111);
    const activated = ok(await call(Clientes.UR_Cliente_CTS, { params:{id:client.id},body:{estado_comercial:'CLIENTE'} }));
    assert.equal(activated.activo, 1);
    assert.ok((await session.reload()).revocada_en);
  });
  await t.test('Eliminar nota audita sin guardar contenido privado', async () => {
    ok(await call(Notas.ER_ClienteNota_CTS, { params:{id:note.id,cliente_id:client.id} }));
    assert.equal(await modelos.clientes_notas.findByPk(note.id), null);
    const audit = await modelos.auditoria_eventos.findAll();
    const json = JSON.stringify(audit);
    assert.ok(!json.includes('Seguimiento'));assert.ok(!json.includes('HASH_PRIVADO_NO_PUBLICAR'));
    assert.ok(audit.some(row => row.accion === 'CLIENTE_NOTA_ELIMINADA'));
  });
  await t.test('Error de auditoría revierte la modificación y no filtra detalles internos', async () => {
    modelos.auditoria_eventos.addHook('beforeCreate', 'fallo-prueba', () => { throw new Error('Mensaje interno privado'); });
    const originalError = console.error;
    const logs = [];
    console.error = message => logs.push(String(message));
    try {
      const result = await call(Clientes.UR_Cliente_CTS, { params:{id:client.id},body:{nombre:'No debe persistir'} });
      ok(result, 500);assert.ok(!JSON.stringify(result.value).includes('Mensaje interno privado'));
      assert.equal((await modelos.crm_clientes.findByPk(client.id)).nombre, 'Juan Cliente');
      assert.ok(logs.some(message => message.includes('ERROR_CRM')));
      assert.ok(!logs.join('').includes('Mensaje interno privado'));
    } finally {
      console.error = originalError;
      modelos.auditoria_eventos.removeHook('beforeCreate', 'fallo-prueba');
    }
  });
});
