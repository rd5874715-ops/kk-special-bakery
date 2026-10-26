import { errorJson, json, mapProduct, publicProductBody, readJson, requireOwner } from '../_lib/common.js';

export async function onRequestPost(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  let body;
  try { body = publicProductBody(await readJson(context.request)); }
  catch (error) { return errorJson(error.message, 400); }
  const { env } = context;
  try {
    const result = await env.DB.prepare(
      'INSERT INTO products (name, price, description, category, available, emoji, image, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products))'
    ).bind(body.name, body.price, body.description, body.category, body.available ? 1 : 0, body.emoji, body.image).run();
    const row = await env.DB.prepare('SELECT id, name, price, description, category, available, emoji, image, sort_order FROM products WHERE id = ?').bind(result.meta.last_row_id).first();
    return json({ product: mapProduct(row) }, 201);
  } catch (error) {
    return errorJson(`Could not create the item: ${String(error?.message || error)}`, 500);
  }
}
