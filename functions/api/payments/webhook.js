import { errorJson,json } from '../../_lib/common.js';
const enc=new TextEncoder();
async function hmac(raw,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,raw)),b=>b.toString(16).padStart(2,'0')).join('')}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
export async function onRequestPost({request,env}){
 const secret=env.RAZORPAY_WEBHOOK_SECRET||'';if(!secret)return errorJson('Payment webhook is not configured.',503);
 const raw=new Uint8Array(await request.arrayBuffer());
 if(raw.length>1024*1024)return errorJson('Webhook payload is too large.',413);
 const supplied=request.headers.get('x-razorpay-signature')||'',eventId=request.headers.get('x-razorpay-event-id')||'';
 if(!eventId||!equal(await hmac(raw,secret),supplied))return errorJson('Webhook signature is invalid.',401);
 let event;try{event=JSON.parse(new TextDecoder().decode(raw))}catch{return errorJson('Webhook JSON is invalid.',400)}
 const type=String(event.event||''),payment=event.payload?.payment?.entity||{},gatewayOrder=event.payload?.order?.entity||{},gatewayOrderId=String(payment.order_id||gatewayOrder.id||''),paymentId=String(payment.id||'');
 if(!['payment.captured','payment.failed','order.paid'].includes(type))return json({ok:true,ignored:true});
 if(!gatewayOrderId)return errorJson('Gateway order ID is missing.',400);
 try{
  const order=await env.DB.prepare('SELECT id,total,items_json,coupon_code,coupon_discount,stock_reserved FROM orders WHERE payment_gateway_order_id=?').bind(gatewayOrderId).first();
  if(!order)return json({ok:true,unmatched:true});
  const inserted=await env.DB.prepare('INSERT OR IGNORE INTO payment_events (event_id,event_type,gateway_order_id,gateway_payment_id) VALUES (?,?,?,?)').bind(eventId,type,gatewayOrderId,paymentId||null).run();
  if(!inserted.meta.changes)return json({ok:true,duplicate:true});
  if(type==='payment.captured'||type==='order.paid'){
   const eventAmount=type==='order.paid'?Number(gatewayOrder.amount_paid||gatewayOrder.amount||0):Number(payment.amount||0);
   const eventCurrency=type==='order.paid'?String(gatewayOrder.currency||'INR'):String(payment.currency||'INR');
   if(eventAmount!==Math.round(Number(order.total)*100)||eventCurrency!=='INR')return errorJson('Webhook amount does not match the order.',409);
   await env.DB.batch([
    env.DB.prepare("UPDATE orders SET payment_status='paid',payment_gateway_payment_id=?,stock_reserved=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(paymentId||null,order.id),
    env.DB.prepare("UPDATE coupon_reservations SET state='applied',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND state='reserved'").bind(order.id)
   ]);
  } else {
   if(Number(order.stock_reserved)===1){
    let items=[];try{items=JSON.parse(order.items_json||'[]')}catch{}
    await env.DB.batch(items.map(item=>env.DB.prepare('UPDATE products SET stock_quantity=CASE WHEN stock_quantity=-1 THEN -1 ELSE stock_quantity+? END WHERE id=?').bind(Number(item.qty)||0,Number(item.id)||0)));
   }
   await env.DB.batch([
    env.DB.prepare("UPDATE orders SET payment_status='failed',stock_reserved=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(order.id),
    env.DB.prepare("UPDATE coupons SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT coupon_id FROM coupon_reservations WHERE order_id=?)").bind(order.id),
    env.DB.prepare("UPDATE coupon_reservations SET state='released',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND state='reserved'").bind(order.id)
   ]);
  }
  return json({ok:true});
 }catch(e){return errorJson('Webhook processing failed: '+String(e?.message||e),500)}
}
