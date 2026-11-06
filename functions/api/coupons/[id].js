import { errorJson,json,readJson,requireOwner } from '../../_lib/common.js';
export async function onRequestPatch(context){
 const denied=await requireOwner(context);if(denied)return denied;
 const id=Number(context.params.id);if(!Number.isSafeInteger(id)||id<1)return errorJson('Invalid coupon ID.',400);
 let body;try{body=await readJson(context.request)}catch(e){return errorJson(e.message,400)}
 const active=body?.active===true?1:body?.active===false?0:null;if(active===null)return errorJson('Active must be true or false.',400);
 try{const r=await context.env.DB.prepare('UPDATE coupons SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(active,id).run();if(!r.meta.changes)return errorJson('Coupon not found.',404);return json({ok:true})}
 catch(e){return errorJson('Could not update coupon.',500)}
}
