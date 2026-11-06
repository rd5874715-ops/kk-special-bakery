import { errorJson, json } from '../_lib/common.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('order'));
  const phone = String(url.searchParams.get('phone') || '').replace(/\D/g, '');
  if (!Number.isSafeInteger(id) || id < 1 || phone.length < 10 || phone.length > 15) return errorJson('Enter the order number and phone number used for the order.', 400);
  try {
    const row = await env.DB.prepare('SELECT id,phone,total,status,created_at,payment_status,payment_method,coupon_code,coupon_discount,delivery_status,rider_name,rider_lat,rider_lng,rider_location_updated_at FROM orders WHERE id=?').bind(id).first();
    const storedPhone = String(row?.phone || '').replace(/\D/g, '');
    if (!row || (storedPhone !== phone && storedPhone.slice(-10) !== phone.slice(-10))) return errorJson('Order not found. Check the number and phone used when ordering.', 404);
    const updates = await env.DB.prepare('SELECT latitude,longitude,note,created_at FROM delivery_updates WHERE order_id=? ORDER BY id DESC LIMIT 10').bind(id).all();
    const hasLocation = Number.isFinite(Number(row.rider_lat)) && Number.isFinite(Number(row.rider_lng));
    return json({ order: {
      id:Number(row.id),total:Number(row.total),status:row.status,createdAt:row.created_at,
      paymentStatus:row.payment_status||'unpaid',paymentMethod:row.payment_method||'cod',
      couponCode:row.coupon_code||null,couponDiscount:Number(row.coupon_discount||0),
      deliveryStatus:row.delivery_status||'not_dispatched',riderName:row.rider_name||'',
      location:hasLocation?{latitude:Number(row.rider_lat),longitude:Number(row.rider_lng),updatedAt:row.rider_location_updated_at}:null,
      locationHistory:(updates.results||[]).map(x=>({latitude:Number(x.latitude),longitude:Number(x.longitude),note:x.note,updatedAt:x.created_at}))
    }});
  } catch (error) {
    return errorJson('Order tracking is not ready. Apply the commerce migration first: '+String(error?.message||error),503);
  }
}
