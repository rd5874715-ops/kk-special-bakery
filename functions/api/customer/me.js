import { json } from '../../_lib/common.js';
import { getCustomer } from '../../_lib/commerce.js';
export async function onRequestGet({request,env}) {
  try{const customer=await getCustomer(request,env);return json({authenticated:!!customer,customer:customer?{id:customer.id,name:customer.name,email:customer.email,phone:customer.phone}:null})}
  catch(e){return json({authenticated:false,customer:null},200)}
}
