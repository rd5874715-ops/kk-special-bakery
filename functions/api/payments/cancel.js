import { errorJson,json,readJson,sameOrigin } from '../../_lib/common.js';
import { requireCustomer } from '../../_lib/commerce.js';
export async function onRequestPost(context){
 if(!sameOrigin(context.request))return errorJson('Request origin could not be verified.',403);
 const denied=await requireCustomer(context);if(denied)return denied;
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const id=Number(body?.localOrderId);if(!Number.isSafeInteger(id)||id<1)return errorJson('Invalid order number.',400);
 try{
  const order=await context.env.DB.prepare('SELECT id,customer_id,payment_status,items_json,stock_deducted,status FROM orders WHERE id=?').bind(id).first();
  if(!order||Number(order.customer_id)!==context.data.customer.id)return errorJson('Order not found.',404);
  if(order.payment_status==='paid')return errorJson('Paid orders cannot be cancelled by this checkout action. Contact the bakery owner.',409);
  if(Number(order.stock_deducted)===1){
   let items=[];try{items=JSON.parse(order.items_json||'[]')}catch{return errorJson('Order stock record needs owner review.',409)}
   const statements=items.map(item=>context.env.DB.prepare('UPDATE products SET stock_quantity=CASE WHEN stock_quantity=-1 THEN -1 ELSE stock_quantity+? END,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(Number(item.qty)||0,Number(item.id)||0));
   statements.push(context.env.DB.prepare("UPDATE coupons SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT coupon_id FROM coupon_reservations WHERE order_id=? AND state='reserved')").bind(id));
   statements.push(context.env.DB.prepare("UPDATE coupon_reservations SET state='released',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND state='reserved'").bind(id));
   statements.push(context.env.DB.prepare("UPDATE orders SET status='Cancelled',payment_status='failed',stock_reserved=0,stock_deducted=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id));
   await context.env.DB.batch(statements);
  }else await context.env.DB.prepare("UPDATE orders SET status='Cancelled',payment_status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
  return json({ok:true,cancelled:true});
 }catch(e){return errorJson('Could not cancel the pending test order: '+String(e?.message||e),500)}
}
