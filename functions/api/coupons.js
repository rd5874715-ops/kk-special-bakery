import { errorJson,json,readJson,requireOwner } from '../_lib/common.js';
export async function onRequestGet(context){
 const denied=await requireOwner(context);if(denied)return denied;
 try{const rows=await context.env.DB.prepare('SELECT id,code,discount_type,discount_value,minimum_order,maximum_discount,usage_limit,used_count,starts_at,expires_at,active,created_at FROM coupons ORDER BY id DESC').all();return json({coupons:rows.results||[]})}
 catch(e){return errorJson('Could not load coupons. Apply the commerce migration first.',503)}
}
export async function onRequestPost(context){
 const denied=await requireOwner(context);if(denied)return denied;
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const code=String(body?.code||'').trim().toUpperCase(),type=String(body?.discount_type||''),value=Number(body?.discount_value),minimum=Math.max(0,Number(body?.minimum_order)||0),cap=body?.maximum_discount==null?null:Number(body.maximum_discount),limit=body?.usage_limit==null?null:Number(body.usage_limit);
 if(!/^[A-Z0-9_-]{3,24}$/.test(code))return errorJson('Coupon code must be 3–24 letters or numbers.',400);
 if(!['percent','fixed'].includes(type)||!Number.isFinite(value)||value<=0||(type==='percent'&&value>90)|| (type==='fixed'&&value>100000))return errorJson('Discount type or value is invalid.',400);
 if(cap!==null&&(!Number.isFinite(cap)||cap<=0))return errorJson('Maximum discount must be positive.',400);
 if(limit!==null&&(!Number.isSafeInteger(limit)||limit<1))return errorJson('Usage limit must be a positive whole number.',400);
 try{await context.env.DB.prepare('INSERT INTO coupons (code,discount_type,discount_value,minimum_order,maximum_discount,usage_limit,starts_at,expires_at,active) VALUES (?,?,?,?,?,?,?,?,1)').bind(code,type,value,minimum,cap,limit,body.starts_at||null,body.expires_at||null).run();return json({ok:true,code},201)}
 catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return errorJson('This coupon code already exists.',409);return errorJson('Could not create coupon.',500)}
}
