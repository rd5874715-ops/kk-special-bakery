import { json,errorJson } from '../../_lib/common.js';
import { requireCustomer } from '../../_lib/commerce.js';
import { mapOrder } from '../../_lib/common.js';
export async function onRequestGet(context){
 const denied=await requireCustomer(context);if(denied)return denied;
 try{const rows=await context.env.DB.prepare('SELECT id,customer_name,phone,address,city,pin,subtotal,delivery_fee,total,status,items_json,created_at,payment_status,payment_method,coupon_code,coupon_discount,delivery_status FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT 100').bind(context.data.customer.id).all();return json({orders:(rows.results||[]).map(mapOrder)})}
 catch(e){return errorJson('Order history is not ready. Apply the commerce migration first.',503)}
}
