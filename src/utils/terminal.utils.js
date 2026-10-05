/* Benjamin Orellana - 05/10/2026 - Entrada oculta para el bootstrap por terminal. */
import { emitKeypressEvents } from 'node:readline';
import { ErrorHttp } from './validacion.utils.js';
export function passwordOculta(prompt) {
  return new Promise((resolve,reject)=>{
    process.stdout.write(prompt);emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();let value='';
    function done(error) {process.stdin.removeListener('keypress',press);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);}
    function press(text,key={}) {
      if(key.ctrl&&['c','d'].includes(key.name)) {done(new ErrorHttp(422,'CANCELADO','Operación cancelada.'));return;}
      if(key.name==='return'||key.name==='enter') {done();return;}
      if(key.name==='backspace') {value=[...value].slice(0,-1).join('');return;}
      if(!key.ctrl&&!key.meta&&text&&!/[\x00-\x1f\x7f]/.test(text)) value+=text;
    }
    process.stdin.on('keypress',press);
  });
}
