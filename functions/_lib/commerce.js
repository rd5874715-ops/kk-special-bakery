import { errorJson, sameOrigin } from './common.js';

const encoder = new TextEncoder();
function encode(bytes) { let s=''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
function decodeCookie(request, name) {
  const raw=(request.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return raw ? decodeURIComponent(raw[1]) : '';
}
async function digest(value) {
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function derivePassword(password,salt) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:210000,hash:'SHA-256'},key,256);
  return encode(new Uint8Array(bits));
}
export async function makePasswordRecord(password) {
  const salt=encode(crypto.getRandomValues(new Uint8Array(16)));
  return {salt,hash:await derivePassword(password,salt)};
}
export async function verifyPassword(password,salt,expected) {
  const actual=await derivePassword(password,salt);
  if(actual.length!==expected.length) return false;
  let mismatch=0; for(let i=0;i<actual.length;i++) mismatch |= actual.charCodeAt(i)^expected.charCodeAt(i);
  return mismatch===0;
}
export function newOpaqueToken() { return encode(crypto.getRandomValues(new Uint8Array(32))); }
export function customerCookie(token) {
  return 'kk_customer_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
}
export function clearCustomerCookie() {
  return 'kk_customer_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
export async function customerLoginAllowed(env,request,scope='login') {
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const secret=String(env.SESSION_SECRET||'customer-auth');
  const ipHash=await digest(scope+':'+ip+':'+secret);
  const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM login_attempts WHERE ip_hash=? AND attempted_at>unixepoch()-900').bind(ipHash).first();
  if(Number(count?.total||0)>=10)return false;
  await env.DB.prepare('INSERT INTO login_attempts (ip_hash) VALUES (?)').bind(ipHash).run();
  return true;
}
export async function createCustomerSession(env,customerId) {
  const token=newOpaqueToken(), tokenHash=await digest(token), expires=Math.floor(Date.now()/1000)+604800;
  await env.DB.prepare('INSERT INTO customer_sessions (token_hash,customer_id,expires_at) VALUES (?,?,?)').bind(tokenHash,customerId,expires).run();
  return token;
}
export async function getCustomer(request,env) {
  const token=decodeCookie(request,'kk_customer_session');
  if(!token) return null;
  const tokenHash=await digest(token), now=Math.floor(Date.now()/1000);
  const row=await env.DB.prepare('SELECT c.id,c.full_name,c.email,c.phone FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>?').bind(tokenHash,now).first();
  return row ? {id:Number(row.id),name:row.full_name,email:row.email,phone:row.phone,tokenHash} : null;
}
export async function requireCustomer(context) {
  if(!sameOrigin(context.request)) return errorJson('Request origin could not be verified.',403);
  try {
    const customer=await getCustomer(context.request,context.env);
    if(!customer) return errorJson('Customer sign-in required.',401);
    context.data={...(context.data||{}),customer};
    return null;
  } catch(error) { return errorJson('Customer session could not be verified.',500); }
}
export function validCustomerInput(body) {
  const name=String(body?.name||'').trim();
  const email=String(body?.email||'').trim().toLowerCase();
  const phone=String(body?.phone||'').trim();
  const password=String(body?.password||'');
  if(name.length<2||name.length>100) throw new Error('Name must contain 2–100 characters.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>190) throw new Error('Enter a valid email address.');
  if(!/^\+?[0-9 ()-]{10,18}$/.test(phone)) throw new Error('Enter a valid phone number.');
  if(password.length<10||password.length>128) throw new Error('Password must be 10–128 characters.');
  return {name,email,phone,password};
}
