import { errorJson,json,readJson,requireOwner } from '../../_lib/common.js';
const allowed=new Set(['not_dispatched','assigned','picked_up','nearby','delivered']);
export async function onRequestPatch(context){
 const denied=await requireOwner(context);if(denied)return denied;
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const id=Number(body?.orderId),status=String(body?.deliveryStatus||''),rider=String(body?.riderName||'').trim().slice(0,80);
 if(!Number.isSafeInteger(id)||id<1||!allowed.has(status))return errorJson('Order ID or delivery status is invalid.',400);
 try{const r=await context.env.DB.prepare('UPDATE orders SET delivery_status=?,rider_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,rider,id).run();if(!r.meta.changes)return errorJson('Order not found.',404);return json({ok:true,id,deliveryStatus:status})}
 catch(e){return errorJson('Delivery status could not be saved. Apply the commerce migration first.',503)}
}
