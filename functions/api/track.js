import { errorJson, json } from '../_lib/common.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('order'));
  const phone = String(url.searchParams.get('phone') || '').replace(/\D/g, '');
  if (!Number.isSafeInteger(id) || id < 1 || phone.length < 10 || phone.length > 15) return errorJson('Enter the order number and phone number used for the order.', 400);
  try {
    const row = await env.DB.prepare('SELECT id, phone, total, status, created_at FROM orders WHERE id = ?').bind(id).first();
    const storedPhone = String(row?.phone || '').replace(/\D/g, '');
    if (!row || (storedPhone !== phone && storedPhone.slice(-10) !== phone.slice(-10))) return errorJson('Order not found. Check the number and phone used when ordering.', 404);
    return json({ order: { id: Number(row.id), total: Number(row.total), status: row.status, createdAt: row.created_at } });
  } catch (error) {
    return errorJson(`Could not check the order status: ${String(error?.message || error)}`, 500);
  }
}
