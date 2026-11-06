import { errorJson, json, readJson, requireOwner } from '../../_lib/common.js';

const allowedStatuses = new Set(['New', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled']);

export async function onRequestPatch(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  const id = Number(context.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return errorJson('Invalid order number.', 400);
  let body;
  try { body = await readJson(context.request); }
  catch (error) { return errorJson(error.message, 400); }
  if (!allowedStatuses.has(body?.status)) return errorJson('Order status is not valid.', 400);
  try {
    const order = await context.env.DB.prepare('SELECT id,status,payment_status,items_json,stock_deducted FROM orders WHERE id=?').bind(id).first();
    if (!order) return errorJson('Order not found.', 404);
    if (body.status === 'Cancelled' && order.payment_status !== 'paid' && Number(order.stock_deducted) === 1) {
      let items = [];
      try { items = JSON.parse(order.items_json || '[]'); } catch { return errorJson('Order stock record is invalid; manual review required.', 409); }
      const statements = items.map(item => context.env.DB.prepare(
        'UPDATE products SET stock_quantity=CASE WHEN stock_quantity=-1 THEN -1 ELSE stock_quantity+? END,updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).bind(Number(item.qty) || 0, Number(item.id) || 0));
      statements.push(context.env.DB.prepare(
        "UPDATE coupons SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT coupon_id FROM coupon_reservations WHERE order_id=? AND state IN ('applied','reserved'))"
      ).bind(id));
      statements.push(context.env.DB.prepare(
        "UPDATE coupon_reservations SET state='released',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND state IN ('applied','reserved')"
      ).bind(id));
      statements.push(context.env.DB.prepare(
        "UPDATE orders SET status='Cancelled',stock_reserved=0,stock_deducted=0,updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(id));
      await context.env.DB.batch(statements);
    } else {
      await context.env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.status,id).run();
    }
    return json({ ok: true, id, status: body.status });
  } catch (error) {
    return errorJson('Could not update the order: '+String(error?.message || error), 500);
  }
}
