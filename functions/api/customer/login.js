import { json,errorJson,readJson,sameOrigin } from '../../_lib/common.js';
import { makePasswordRecord,verifyPassword,createCustomerSession,customerCookie } from '../../_lib/commerce.js';
export async function onRequestPost(context) {
  if(!sameOrigin(context.request)) return errorJson('Request origin could not be verified.',403);
  let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
  const email=String(body?.email||'').trim().toLowerCase(),password=String(body?.password||'');
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||password.length>128) return errorJson('Enter your account email and password.',400);
  try{
    const user=await context.env.DB.prepare('SELECT id,full_name,email,phone,password_salt,password_hash FROM customers WHERE email=?').bind(email).first();
    if(!user||!(await verifyPassword(password,user.password_salt,user.password_hash))) return errorJson('Email or password is incorrect.',401);
    const token=await createCustomerSession(context.env,Number(user.id));
    return json({ok:true,customer:{id:Number(user.id),name:user.full_name,email:user.email}},200,{'Set-Cookie':customerCookie(token)});
  }catch(e){return errorJson('Customer sign-in is temporarily unavailable.',500)}
}
