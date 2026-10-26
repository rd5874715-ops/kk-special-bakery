import { errorJson, json, getAppConfig, mapOrder, readJson, requireOwner, sameOrigin } from '../_lib/common.js';

const statusSet = new Set(['New', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled']);

export async function onRequestGet(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  try {
    const rows = await context.env.DB.prepare(
      'SELECT id, customer_name, phone, address, city, pin, subtotal, delivery_fee, total, status, items_json, created_at FROM orders ORDER BY id DESC LIMIT 500'
    ).all();
    return json({ orders: (rows.results || []).map(mapOrder) });
  } catch (error) {
    return errorJson(`Could not load orders: ${String(error?.message || error)}`, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return errorJson('Request origin could not be verified.', 403);
  let body;
  try { body = await readJson(request); }
  catch (error) { return errorJson(error.message, 400); }
  const customer = body?.customer;
  const name = String(customer?.name || '').trim();
  const phone = String(customer?.phone || '').trim();
  const address = String(customer?.address || '').trim();
  const city = String(customer?.city || '').trim();
  const pin = String(customer?.pin || '').trim();
  if (!name || name.length > 100 || !/^\+?[0-9 ()-]{10,18}$/.test(phone) || !address || address.length > 300 || !city || city.length > 100 || !/^\d{6}$/.test(pin)) {
    return errorJson('Enter a valid name, phone number, full address, city and 6-digit PIN code.', 400);
  }
  if (!Array.isArray(body?.items) || !body.items.length || body.items.length > 40) return errorJson('Add at least one menu item to the cart.', 400);
  try {
    const config = await getAppConfig(env);
    const items = [];
    let subtotal = 0;
    const idsSeen = new Set();
    for (const raw of body.items) {
      const id = Number(raw?.id);
      const qty = Number(raw?.qty);
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(qty) || qty < 1 || qty > 99 || idsSeen.has(id)) {
        return errorJson('One of the cart items has an invalid ID or quantity.', 400);
      }
      idsSeen.add(id);
      const row = await env.DB.prepare('SELECT id, name, price, description, category, available, emoji, image FROM products WHERE id = ?').bind(id).first();
      if (!row) return errorJson('A menu item is no longer available. Refresh the menu and try again.', 409);
      if (!row.available) return errorJson(`${row.name} is currently out of stock. Remove it from your cart and try again.`, 409);
      const price = Number(row.price);
      const lineTotal = price * qty;
      subtotal += lineTotal;
      items.push({ id: Number(row.id), name: row.name, price, desc: row.description || '', category: row.category, emoji: row.emoji, image: row.image || '', qty, lineTotal });
    }
    const deliveryFee = config.settings.freeDeliveryAbove > 0 && subtotal >= config.settings.freeDeliveryAbove ? 0 : Number(config.settings.deliveryFee || 0);
    const total = subtotal + deliveryFee;
    const result = await env.DB.prepare(
      'INSERT INTO orders (customer_name, phone, address, city, pin, subtotal, delivery_fee, total, status, items_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, phone, address, city, pin, subtotal, deliveryFee, total, 'New', JSON.stringify(items)).run();
    const order = {
      id: Number(result.meta.last_row_id), name, phone, address, city, pin, subtotal,
      deliveryFee, total, status: 'New', items,
      createdAt: new Date().toISOString(),
    };
    return json({ order }, 201);
  } catch (error) {
    return errorJson(`Could not place order: ${String(error?.message || error)}`, 500);
  }
}
