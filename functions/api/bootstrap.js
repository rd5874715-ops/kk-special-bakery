import { json, mapProduct, getAppConfig } from '../_lib/common.js';

export async function onRequestGet({ env }) {
  const missing = [];
  if (!env.DB) missing.push('D1 database binding DB');
  if (!env.BAKERY_IMAGES) missing.push('R2 image bucket binding BAKERY_IMAGES');
  if (!env.OWNER_PASSWORD || String(env.OWNER_PASSWORD).length < 12) missing.push('OWNER_PASSWORD secret (at least 12 characters)');
  if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) missing.push('SESSION_SECRET secret (at least 32 characters)');
  if (missing.length) return json({ backendReady: false, missing, message: 'Server setup is incomplete. The website is read-only until all backend items are configured.' });

  try {
    const [rows, config] = await Promise.all([
      env.DB.prepare('SELECT id, name, price, description, category, available, emoji, image, sort_order FROM products ORDER BY sort_order, id').all(),
      getAppConfig(env),
    ]);
    return json({ backendReady: true, products: (rows.results || []).map(mapProduct), config });
  } catch (error) {
    return json({ backendReady: false, missing: ['Database schema or seed data'], message: 'The database is not initialized. Apply migrations/schema.sql and deploy again.', detail: String(error?.message || error) }, 503);
  }
}
