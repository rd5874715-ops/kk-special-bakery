import { errorJson,json } from '../../_lib/common.js';
export async function onRequestGet({request,env}){
 const url=new URL(request.url),code=String(url.searchParams.get('code')||'').trim().toUpperCase(),subtotal=Number(url.searchParams.get('subtotal'));
 if(!/^[A-Z0-9_-]{3,24}$/.test(code)||!Number.isFinite(subtotal)||subtotal<=0||subtotal>10000000)return errorJson('Enter a valid coupon and order subtotal.',400);
 try{
  const row=await env.DB.prepare('SELECT * FROM coupons WHERE code=? AND active=1').bind(code).first();
  if(!row)return errorJson('Coupon is not valid.',404);
  const now=new Date().toISOString();
  if(row.starts_at&&now<row.starts_at)return errorJson('Coupon is not active yet.',409);
  if(row.expires_at&&now>row.expires_at)return errorJson('Coupon has expired.',409);
  if(subtotal<Number(row.minimum_order))return errorJson('Minimum order value for this coupon is not reached.',409);
  if(row.usage_limit!==null&&Number(row.used_count)>=Number(row.usage_limit))return errorJson('Coupon usage limit has been reached.',409);
  let discount=row.discount_type==='percent'?subtotal*Number(row.discount_value)/100:Number(row.discount_value);
  if(row.maximum_discount!==null)discount=Math.min(discount,Number(row.maximum_discount));
  discount=Math.max(0,Math.min(subtotal,Math.round(discount*100)/100));
  return json({valid:true,code:row.code,discount,discountType:row.discount_type,discountValue:Number(row.discount_value),minimumOrder:Number(row.minimum_order)});
 }catch(e){return errorJson('Coupon service is unavailable. Apply the commerce migration first.',503)}
}
