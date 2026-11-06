import { errorJson,json,readJson,requireOwner } from '../_lib/common.js';
export async function onRequestGet(context){
 const denied=await requireOwner(context);if(denied)return denied;
 try{const rows=await context.env.DB.prepare('SELECT id,name,price,available,stock_quantity,low_stock_threshold FROM products ORDER BY sort_order,id').all();return json({inventory:rows.results||[]})}
 catch(e){return errorJson('Inventory is not configured. Apply the commerce migration first.',503)}
}
export async function onRequestPut(context){
 const denied=await requireOwner(context);if(denied)return denied;
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const id=Number(body?.id),stock=Number(body?.stock_quantity),threshold=Number(body?.low_stock_threshold??5);
 if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(stock)||stock< -1||stock>1000000||!Number.isSafeInteger(threshold)||threshold<0||threshold>100000)return errorJson('Inventory values are invalid. Use -1 for unlimited stock.',400);
 try{const r=await context.env.DB.prepare('UPDATE products SET stock_quantity=?,low_stock_threshold=?,available=CASE WHEN ?=0 THEN 0 ELSE available END,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(stock,threshold,stock,id).run();if(!r.meta.changes)return errorJson('Product not found.',404);return json({ok:true,id,stock_quantity:stock,low_stock_threshold:threshold})}
 catch(e){return errorJson('Could not update inventory.',500)}
}
