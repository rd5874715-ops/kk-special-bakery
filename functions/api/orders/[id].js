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
    const result = await context.env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.status, id).run();
    if (!result.meta.changes) return errorJson('Order not found.', 404);
    return json({ ok: true, id, status: body.status });
  } catch (error) {
    return errorJson(`Could not update the order: ${String(error?.message || error)}`, 500);
  }
}
