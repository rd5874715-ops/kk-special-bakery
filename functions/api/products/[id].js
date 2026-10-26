import { errorJson, json, publicProductBody, readJson, requireOwner } from '../../_lib/common.js';

export async function onRequestPut(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  const id = Number(context.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return errorJson('Invalid product ID.', 400);
  let body;
  try { body = publicProductBody(await readJson(context.request)); }
  catch (error) { return errorJson(error.message, 400); }
  try {
    const result = await context.env.DB.prepare(
      'UPDATE products SET name = ?, price = ?, description = ?, category = ?, available = ?, emoji = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(body.name, body.price, body.description, body.category, body.available ? 1 : 0, body.emoji, body.image, id).run();
    if (!result.meta.changes) return errorJson('Menu item was not found.', 404);
    return json({ ok: true });
  } catch (error) {
    return errorJson(`Could not update the item: ${String(error?.message || error)}`, 500);
  }
}

export async function onRequestDelete(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  const id = Number(context.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return errorJson('Invalid product ID.', 400);
  try {
    const result = await context.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
    if (!result.meta.changes) return errorJson('Menu item was not found.', 404);
    return json({ ok: true });
  } catch (error) {
    return errorJson(`Could not remove the item: ${String(error?.message || error)}`, 500);
  }
}
