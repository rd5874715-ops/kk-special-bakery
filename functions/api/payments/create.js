import { errorJson,json,readJson,sameOrigin,getAppConfig } from '../../_lib/common.js';
import { requireCustomer } from '../../_lib/commerce.js';
async function releaseReservation(env,orderId,items,couponId){
 try{
  await env.DB.batch(items.map(item=>env.DB.prepare("UPDATE products SET stock_quantity=CASE WHEN stock_quantity=-1 THEN -1 ELSE stock_quantity+? END WHERE id=?").bind(item.qty,item.id)));
  if(couponId){await env.DB.prepare("UPDATE coupons SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END WHERE id=?").bind(couponId).run();await env.DB.prepare("UPDATE coupon_reservations SET state='released',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(orderId).run();}
  await env.DB.prepare('UPDATE orders SET stock_reserved=0,payment_status=\'failed\' WHERE id=?').bind(orderId).run();
 }catch(e){/* Owner can inspect pending reservations and reconcile stock. */}
}
export async function onRequestPost(context){
 if(!sameOrigin(context.request))return errorJson('Request origin could not be verified.',403);
 const denied=await requireCustomer(context);if(denied)return denied;
 const customer=context.data.customer;
 const keyId=context.env.RAZORPAY_KEY_ID||'',keySecret=context.env.RAZORPAY_KEY_SECRET||'';
 if(!keyId.startsWith('rzp_test_')||!keySecret)return errorJson('Payment sandbox is not configured. A Razorpay TEST key pair is required.',503);
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const address=String(body?.address||'').trim(),city=String(body?.city||'').trim(),pin=String(body?.pin||'').trim();
 if(!address||address.length>300||!city||city.length>100||!/^\d{6}$/.test(pin))return errorJson('Enter a complete delivery address, city and 6-digit PIN code.',400);
 if(!Array.isArray(body?.items)||!body.items.length||body.items.length>40)return errorJson('Cart is empty or too large.',400);
 const ids=new Set(),items=[];let subtotal=0;
 try{
  for(const raw of body.items){
   const id=Number(raw?.id),qty=Number(raw?.qty);
   if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(qty)||qty<1||qty>30||ids.has(id))return errorJson('Cart contains an invalid item or quantity.',400);
   ids.add(id);
   const p=await context.env.DB.prepare('SELECT id,name,price,description,category,available,emoji,image,stock_quantity FROM products WHERE id=?').bind(id).first();
   if(!p||!p.available)return errorJson('A selected product is unavailable.',409);
   if(Number(p.stock_quantity??-1)!==-1&&Number(p.stock_quantity)<qty)return errorJson(p.name+' does not have enough stock.',409);
   const price=Number(p.price),lineTotal=Math.round(price*qty*100)/100;subtotal+=lineTotal;
   items.push({id:Number(p.id),name:p.name,price,desc:p.description||'',category:p.category,emoji:p.emoji,image:p.image||'',qty,lineTotal});
  }
  const config=await getAppConfig(context.env);
  let couponId=null,couponCode=null,discount=0;
  if(body.couponCode){
   couponCode=String(body.couponCode).trim().toUpperCase();
   const coupon=await context.env.DB.prepare('SELECT * FROM coupons WHERE code=? AND active=1').bind(couponCode).first();
   const now=new Date().toISOString();
   if(!coupon|| (coupon.starts_at&&now<coupon.starts_at)||(coupon.expires_at&&now>coupon.expires_at)||(coupon.usage_limit!==null&&Number(coupon.used_count)>=Number(coupon.usage_limit))||subtotal<Number(coupon.minimum_order))return errorJson('Coupon is invalid, expired, exhausted or below its minimum order.',409);
   couponId=Number(coupon.id);
   discount=coupon.discount_type==='percent'?subtotal*Number(coupon.discount_value)/100:Number(coupon.discount_value);
   if(coupon.maximum_discount!==null)discount=Math.min(discount,Number(coupon.maximum_discount));
   discount=Math.max(0,Math.min(subtotal,Math.round(discount*100)/100));
  }
  const deliveryFee=Number(config.settings.freeDeliveryAbove)>0&&subtotal-discount>=Number(config.settings.freeDeliveryAbove)?0:Number(config.settings.deliveryFee||0);
  const total=Math.round((subtotal-discount+deliveryFee)*100)/100;
  if(!Number.isSafeInteger(Math.round(total*100))||total<=0)return errorJson('Order total is invalid.',400);
  // Atomic stock reservation: CHECK(stock_quantity >= -1) rolls back the entire D1 batch on oversell.
  await context.env.DB.batch(items.map(item=>context.env.DB.prepare("UPDATE products SET stock_quantity=CASE WHEN available=1 AND (stock_quantity=-1 OR stock_quantity>=?) THEN CASE WHEN stock_quantity=-1 THEN -1 ELSE stock_quantity-? END ELSE -2 END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(item.qty,item.qty,item.id)));
  let orderId=null;
  try{
   const ins=await context.env.DB.prepare("INSERT INTO orders (customer_name,phone,address,city,pin,subtotal,delivery_fee,total,status,items_json,payment_status,payment_method,customer_id,coupon_code,coupon_discount,stock_reserved) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)").bind(customer.name,customer.phone,address,city,pin,subtotal,deliveryFee,total,'New',JSON.stringify(items),'pending','razorpay',customer.id,couponCode,discount).run();
   orderId=Number(ins.meta.last_row_id);
   if(couponId){
    const reserved=await context.env.DB.prepare("UPDATE coupons SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1 AND (usage_limit IS NULL OR used_count<usage_limit)").bind(couponId).run();
    if(!reserved.meta.changes)throw new Error('Coupon usage limit was reached during checkout.');
    await context.env.DB.prepare("INSERT INTO coupon_reservations (order_id,coupon_id,discount_amount,state) VALUES (?,?,?,'reserved')").bind(orderId,couponId,discount).run();
   }
   const auth='Basic '+btoa(keyId+':'+keySecret);
   const gateway=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({amount:Math.round(total*100),currency:'INR',receipt:'kkb-'+orderId,notes:{local_order_id:String(orderId)}})});
   const gatewayData=await gateway.json().catch(()=>({}));
   if(!gateway.ok||!gatewayData.id)throw new Error(gatewayData.error?.description||'Payment provider could not create the test order.');
   await context.env.DB.prepare("UPDATE orders SET payment_gateway_order_id=? WHERE id=?").bind(gatewayData.id,orderId).run();
   return json({ok:true,localOrderId:orderId,keyId,razorpayOrderId:gatewayData.id,amount:gatewayData.amount,currency:gatewayData.currency,prefill:{name:customer.name,email:customer.email,contact:customer.phone},discount,deliveryFee,subtotal,total,items,couponCode},201);
  }catch(error){
   if(orderId)await releaseReservation(context.env,orderId,items,couponId);
   else await context.env.DB.batch(items.map(item=>context.env.DB.prepare("UPDATE products SET stock_quantity=CASE WHEN stock_quantity=-1 THEN -1 ELSE stock_quantity+? END WHERE id=?").bind(item.qty,item.id))).catch(()=>{});
   if(String(error?.message||error).toLowerCase().includes('constraint'))return errorJson('Stock or coupon availability changed. Refresh the menu and try again.',409);
   return errorJson(String(error?.message||'Could not create a payment order.'),502);
  }
 }catch(error){return errorJson('Could not prepare checkout. '+String(error?.message||error),500)}
}
