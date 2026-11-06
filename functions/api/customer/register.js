import { json, errorJson, readJson, sameOrigin } from '../../_lib/common.js';
import { validCustomerInput,makePasswordRecord,createCustomerSession,customerCookie } from '../../_lib/commerce.js';
export async function onRequestPost(context) {
  if(!sameOrigin(context.request)) return errorJson('Request origin could not be verified.',403);
  let body; try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
  let input,record;
  try{input=validCustomerInput(body);record=await makePasswordRecord(input.password)}catch(e){return errorJson(e.message,400)}
  try {
    const result=await context.env.DB.prepare('INSERT INTO customers (full_name,email,phone,password_salt,password_hash) VALUES (?,?,?,?,?)').bind(input.name,input.email,input.phone,record.salt,record.hash).run();
    const id=Number(result.meta.last_row_id),token=await createCustomerSession(context.env,id);
    return json({ok:true,customer:{id,name:input.name,email:input.email},message:'Customer account created.'},201,{'Set-Cookie':customerCookie(token)});
  } catch(e) {
    if(String(e?.message||e).toLowerCase().includes('unique')) return errorJson('An account with this email already exists.',409);
    return errorJson('Could not create the customer account.',500);
  }
}
