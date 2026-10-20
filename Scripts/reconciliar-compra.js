/* Revisión local administrativa. No crea links ni envía cobros; puede confirmar pagos existentes. */
const args=process.argv.slice(2);
if(args.length!==2 || args[0]!=='--referencia' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(args[1])) {
  console.error('Uso: node Scripts/reconciliar-compra.js --referencia UUID_DE_COMPRA');process.exit(1);
}
let db;
try {
  ({default:db}=await import('../src/DataBase/db.js'));
  const {reconciliarCompra}=await import('../src/Services/Compra/reconciliacionCompra.service.js');
  const result=await reconciliarCompra(args[1]);
  console.log(JSON.stringify(result));
  if(!result.completa)process.exitCode=2;
} catch(error) {
  console.error(JSON.stringify({referencia:args[1],error:error.code??'ERROR_INTERNO',nota:'No se creó otro cobro. Revisar y reintentar la misma referencia.'}));
  process.exitCode=1;
} finally {if(db)await db.close();}
