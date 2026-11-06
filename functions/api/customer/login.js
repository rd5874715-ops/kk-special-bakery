import { json,errorJson,readJson,sameOrigin } from '../../_lib/common.js';
import { verifyPassword,createCustomerSession,customerCookie,customerLoginAllowed } from '../../_lib/commerce.js';
export async function onRequestPost(context) {
  if(!sameOrigin(context.request)) return errorJson('Request origin could not be verified.',403);
  const allowed=await customerLoginAllowed(context.env,context.request,'customer-login');if(!allowed)return errorJson('Too many sign-in attempts. Wait 15 minutes and try again.',429);
  let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
  const email=String(body?.email||'').trim().toLowerCase(),password=String(body?.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length>128) return errorJson('Enter your account email and password.',400);
  try{
    const user=await context.env.DB.prepare('SELECT id,full_name,email,phone,password_salt,password_hash FROM customers WHERE email=?').bind(email).first();
    if(!user||!(await verifyPassword(password,user.password_salt,user.password_hash))) return errorJson('Email or password is incorrect.',401);
    await context.env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(await (async()=>{const ip=context.request.headers.get('CF-Connecting-IP')||'unknown';const secret=String(context.env.SESSION_SECRET||'customer-auth');const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('customer-login:'+ip+':'+secret));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')})()).run();
    const token=await createCustomerSession(context.env,Number(user.id));
    return json({ok:true,customer:{id:Number(user.id),name:user.full_name,email:user.email}},200,{'Set-Cookie':customerCookie(token)});
  }catch(e){return errorJson('Customer sign-in is temporarily unavailable.',500)}
}
