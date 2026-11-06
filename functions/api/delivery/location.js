import { errorJson,json,readJson,requireOwner } from '../../_lib/common.js';
export async function onRequestPost(context){
 const denied=await requireOwner(context);if(denied)return denied;
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const orderId=Number(body?.orderId),lat=Number(body?.latitude),lng=Number(body?.longitude),rider=String(body?.riderName||'').trim().slice(0,80),note=String(body?.note||'').trim().slice(0,160);
 if(!Number.isSafeInteger(orderId)||orderId<1||!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lng)||lng< -180||lng>180)return errorJson('Order or GPS coordinates are invalid.',400);
 try{
  const exists=await context.env.DB.prepare('SELECT id FROM orders WHERE id=?').bind(orderId).first();if(!exists)return errorJson('Order not found.',404);
  await context.env.DB.batch([
   context.env.DB.prepare("UPDATE orders SET rider_lat=?,rider_lng=?,rider_location_updated_at=CURRENT_TIMESTAMP,rider_name=?,delivery_status=CASE WHEN delivery_status='not_dispatched' THEN 'assigned' ELSE delivery_status END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(lat,lng,rider,orderId),
   context.env.DB.prepare('INSERT INTO delivery_updates (order_id,latitude,longitude,note) VALUES (?,?,?,?)').bind(orderId,lat,lng,note)
  ]);
  return json({ok:true,orderId,latitude:lat,longitude:lng,updatedAt:new Date().toISOString()});
 }catch(e){return errorJson('GPS tracking storage is not ready. Apply the commerce migration first.',503)}
}
