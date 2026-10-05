/* Benjamin Orellana - 05/10/2026 - Contraseñas scrypt y tokens aleatorios. */
import { randomBytes,createHash,scrypt as nativeScrypt,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { exigir } from './validacion.utils.js';
const scrypt=promisify(nativeScrypt),options={N:65536,r:8,p:2,maxmem:128*1024**2};
let active=0;
async function derive(value,salt) {
  exigir(active<2,429,'AUTH_OCUPADA','Hay demasiados intentos simultáneos. Reintentá.');
  active++;try {return await scrypt(value,salt,64,options);} finally {active--;}
}
export function password(value) {
  exigir(typeof value==='string' && [...value].length>=15 && [...value].length<=128 && Buffer.byteLength(value)<=1024 && !value.includes('\0'),422,'PASSWORD_INVALIDO','La contraseña debe tener entre 15 y 128 caracteres.');
  return value;
}
export function hashValido(hash) {return typeof hash==='string' && /^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash);}
export async function hashPassword(value) {
  password(value);const salt=randomBytes(16).toString('hex'),key=await derive(value,salt);
  return `scrypt$65536$8$2$${salt}$${key.toString('hex')}`;
}
export async function verificarPassword(value,hash) {
  if(typeof value!=='string' || [...value].length>128 || Buffer.byteLength(value)>1024 || value.includes('\0')) return false;
  const valid=hashValido(hash),parts=valid?hash.split('$'):[],key=await derive(value,valid?parts[4]:'0'.repeat(32));
  return valid&&timingSafeEqual(key,Buffer.from(parts[5],'hex'));
}
export function igualSeguro(a,b) {
  if(typeof a!=='string'||typeof b!=='string') return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export const tokenAleatorio=()=>randomBytes(32).toString('base64url');
export const hashToken=value=>createHash('sha256').update(value).digest('hex');
export const tokenCsrf=value=>hashToken('factore-csrf:'+value);
export const tokenValido=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
