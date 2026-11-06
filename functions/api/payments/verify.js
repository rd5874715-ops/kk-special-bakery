import { errorJson,json,readJson,sameOrigin } from '../../_lib/common.js';
import { requireCustomer } from '../../_lib/commerce.js';
const enc=new TextEncoder();
async function hmac(value,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
export async function onRequestPost(context){
 if(!sameOrigin(context.request))return errorJson('Request origin could not be verified.',403);
 const denied=await requireCustomer(context);if(denied)return denied;
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const id=Number(body?.localOrderId),orderId=String(body?.razorpay_order_id||''),paymentId=String(body?.razorpay_payment_id||''),signature=String(body?.razorpay_signature||'');
 if(!Number.isSafeInteger(id)||id<1||!orderId||!paymentId||!signature)return errorJson('Payment verification details are incomplete.',400);
 const secret=context.env.RAZORPAY_KEY_SECRET||'',keyId=context.env.RAZORPAY_KEY_ID||'';
 if(!keyId.startsWith('rzp_test_')||!secret)return errorJson('Test payment credentials are not configured.',503);
 try{
  const order=await context.env.DB.prepare('SELECT id,total,customer_id,payment_gateway_order_id,payment_status FROM orders WHERE id=?').bind(id).first();
  if(!order||Number(order.customer_id)!==context.data.customer.id||order.payment_gateway_order_id!==orderId)return errorJson('Order does not belong to this customer or payment.',403);
  const expected=await hmac(orderId+'|'+paymentId,secret);
  if(!equal(expected,signature))return errorJson('Payment signature verification failed.',400);
  const auth='Basic '+btoa(keyId+':'+secret);
  const response=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(paymentId),{headers:{Authorization:auth}});
  const payment=await response.json().catch(()=>({}));
  if(!response.ok||payment.order_id!==orderId||payment.currency!=='INR'||Number(payment.amount)!==Math.round(Number(order.total)*100)||payment.status!=='captured')return errorJson('Payment is not confirmed as captured by the payment provider.',409);
  await context.env.DB.batch([
   context.env.DB.prepare("UPDATE orders SET payment_status='paid',payment_gateway_payment_id=?,stock_reserved=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status IN ('pending','unpaid')").bind(paymentId,id),
   context.env.DB.prepare("UPDATE coupon_reservations SET state='applied',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND state='reserved'").bind(id),
   context.env.DB.prepare("INSERT OR IGNORE INTO payment_events (event_id,event_type,gateway_order_id,gateway_payment_id) VALUES (?,?,?,?)").bind('checkout_'+paymentId,'checkout.verified',orderId,paymentId)
  ]);
  return json({ok:true,paymentStatus:'paid',orderId:id});
 }catch(e){return errorJson('Could not verify payment: '+String(e?.message||e),500)}
}
