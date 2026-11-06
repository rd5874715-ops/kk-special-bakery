import { json,errorJson,sameOrigin } from '../../_lib/common.js';
import { getCustomer,clearCustomerCookie } from '../../_lib/commerce.js';
export async function onRequestPost(context) {
  if(!sameOrigin(context.request)) return errorJson('Request origin could not be verified.',403);
  try{const customer=await getCustomer(context.request,context.env);if(customer) await context.env.DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(customer.tokenHash).run();}
  catch(e){return errorJson('Could not close the customer session.',500)}
  return json({ok:true},200,{'Set-Cookie':clearCustomerCookie()});
}
