/* Prueba manual local: crea una compra ficticia y la cancela; no llama a MP. */
import { randomUUID,randomBytes } from 'node:crypto';
const args=process.argv.slice(2);
if(args.length!==2 || args[0]!=='--curso' || !/^[1-9]\d{0,19}$/.test(args[1]) || BigInt(args[1])>18446744073709551615n) {
  console.error('Uso: node Scripts/probar-compra-http.js --curso ID_PUBLICADO_CON_VENTA_ONLINE');process.exit(1);
}
const referencia=randomUUID(),token=randomBytes(32).toString('hex');
async function call(path,method='GET',body) {
  const res=await fetch('http://127.0.0.1:3001'+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'X-Compra-Token':token,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error?.code || 'HTTP_'+res.status);
  return data.data;
}
try {
  const data=await call('/api/checkout/compras','POST',{referencia,nombre:'Prueba checkout DESA',email:'checkout-desa@example.invalid',curso_ids:[args[1]]});
  await call('/api/checkout/compras/'+referencia);
  const cancelled=await call('/api/checkout/compras/'+referencia+'/cancelar','POST',{});
  console.log(JSON.stringify({creada:true,consultada:true,referencia,total:data.total,moneda:data.moneda,estado:cancelled.estado,mercadopago_contactado:false}));
} catch(error) {
  console.error(JSON.stringify({error:error.message,referencia,nota:'No se intentó cobrar. Revisar el resultado antes de repetir.'}));process.exitCode=1;
}
