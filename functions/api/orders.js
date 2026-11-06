import { errorJson, json, getAppConfig, mapOrder, readJson, requireOwner, sameOrigin } from '../_lib/common.js';
import { getCustomer } from '../_lib/commerce.js';

export async function onRequestGet(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  try {
    const rows = await context.env.DB.prepare(
      'SELECT id, customer_name, phone, address, city, pin, subtotal, delivery_fee, total, status, items_json, created_at, payment_status, payment_method, coupon_code, coupon_discount, delivery_status FROM orders ORDER BY id DESC LIMIT 500'
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
  if (body?.paymentMethod && body.paymentMethod !== 'cod') return errorJson('Online payment must use the secure payment checkout.', 400);
  try {
    const signedCustomer = await getCustomer(request, env).catch(() => null);
    if (signedCustomer && signedCustomer.phone.replace(/\D/g, '').slice(-10) !== phone.replace(/\D/g, '').slice(-10)) {
      return errorJson('The checkout phone number must match the signed-in account.', 400);
    }
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
      const row = await env.DB.prepare('SELECT id, name, price, description, category, available, emoji, image, stock_quantity FROM products WHERE id = ?').bind(id).first();
      if (!row) return errorJson('A menu item is no longer available. Refresh the menu and try again.', 409);
      if (!row.available) return errorJson(`${row.name} is currently out of stock. Remove it from your cart and try again.`, 409);
      if (Number(row.stock_quantity ?? -1) !== -1 && Number(row.stock_quantity) < qty) return errorJson(`${row.name} has insufficient stock.`, 409);
      const price = Number(row.price), lineTotal = Math.round(price * qty * 100) / 100;
      subtotal += lineTotal;
      items.push({ id: Number(row.id), name: row.name, price, desc: row.description || '', category: row.category, emoji: row.emoji, image: row.image || '', qty, lineTotal });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    let coupon = null, discount = 0;
    if (body.couponCode) {
      const code = String(body.couponCode).trim().toUpperCase();
      coupon = await env.DB.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').bind(code).first();
      const now = new Date().toISOString();
      if (!coupon || (coupon.starts_at && now < coupon.starts_at) || (coupon.expires_at && now > coupon.expires_at) ||
          (coupon.usage_limit !== null && Number(coupon.used_count) >= Number(coupon.usage_limit)) || subtotal < Number(coupon.minimum_order)) {
        return errorJson('Coupon is invalid, expired, exhausted or below its minimum order.', 409);
      }
      discount = coupon.discount_type === 'percent' ? subtotal * Number(coupon.discount_value) / 100 : Number(coupon.discount_value);
      if (coupon.maximum_discount !== null) discount = Math.min(discount, Number(coupon.maximum_discount));
      discount = Math.max(0, Math.min(subtotal, Math.round(discount * 100) / 100));
    }
    const deliveryFee = config.settings.freeDeliveryAbove > 0 && subtotal - discount >= config.settings.freeDeliveryAbove ? 0 : Number(config.settings.deliveryFee || 0);
    const total = Math.round((subtotal - discount + deliveryFee) * 100) / 100;
    const statements = [];
    if (coupon) statements.push(env.DB.prepare(
      "UPDATE coupons SET used_count=CASE WHEN active=1 AND (usage_limit IS NULL OR used_count<usage_limit) THEN used_count+1 ELSE -1 END,updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(Number(coupon.id)));
    for (const item of items) statements.push(env.DB.prepare(
      "UPDATE products SET stock_quantity=CASE WHEN available=1 AND (stock_quantity=-1 OR stock_quantity>=?) THEN CASE WHEN stock_quantity=-1 THEN -1 ELSE stock_quantity-? END ELSE -2 END,updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(item.qty, item.qty, item.id));
    statements.push(env.DB.prepare(
      "INSERT INTO orders (customer_name,phone,address,city,pin,subtotal,delivery_fee,total,status,items_json,payment_status,payment_method,customer_id,coupon_code,coupon_discount,stock_reserved,stock_deducted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)"
    ).bind(name, phone, address, city, pin, subtotal, deliveryFee, total, 'New', JSON.stringify(items), 'unpaid', 'cod', signedCustomer?.id || null, coupon?.code || null, discount));
    if (coupon) statements.push(env.DB.prepare(
      "INSERT INTO coupon_reservations (order_id,coupon_id,discount_amount,state) VALUES (last_insert_rowid(),?,?,'applied')"
    ).bind(Number(coupon.id), discount));
    const results = await env.DB.batch(statements);
    const insertIndex = statements.length - (coupon ? 2 : 1);
    const orderId = Number(results[insertIndex]?.meta?.last_row_id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) throw new Error('The order was not saved.');
    const order = {
      id: orderId, name, phone, address, city, pin, subtotal, deliveryFee, discount, couponCode: coupon?.code || null,
      total, status: 'New', paymentStatus: 'unpaid', paymentMethod: 'cod', deliveryStatus: 'not_dispatched', items,
      createdAt: new Date().toISOString(),
    };
    return json({ order }, 201);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes('constraint')) return errorJson('Stock or coupon availability changed. Refresh and retry the order.', 409);
    return errorJson(`Could not place order: ${String(error?.message || error)}`, 500);
  }
}
