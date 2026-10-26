const encoder = new TextEncoder();

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export function errorJson(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 1024 * 1024) throw new Error('Request is too large.');
  try {
    return await request.json();
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let mismatch = left.length ^ right.length;
  const limit = Math.max(left.length, right.length);
  for (let i = 0; i < limit; i += 1) mismatch |= (left[i] || 0) ^ (right[i] || 0);
  return mismatch === 0;
}

export function passwordMatches(candidate, expected) {
  if (typeof candidate !== 'string' || !expected) return false;
  return constantTimeEqual(candidate, expected);
}

export async function makeSessionToken(secret, now = Date.now()) {
  const payload = { sub: 'owner', exp: Math.floor(now / 1000) + 12 * 60 * 60 };
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(body, secret));
  return `${body}.${signature}`;
}

export async function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2 || parts.some((part) => !part)) return false;
  const [body, suppliedSignature] = parts;
  let expectedSignature;
  try {
    expectedSignature = bytesToBase64Url(await hmac(body, secret));
  } catch {
    return false;
  }
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
    return payload?.sub === 'owner' && Number(payload.exp) > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return `kk_owner_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}

export function clearSessionCookie() {
  return 'kk_owner_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

export async function ownerAuthorized(request, env) {
  if (!env?.SESSION_SECRET) return false;
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)kk_owner_session=([^;]+)/);
  if (!match) return false;
  return verifySessionToken(decodeURIComponent(match[1]), env.SESSION_SECRET);
}

export async function requireOwner(context) {
  if (!(await ownerAuthorized(context.request, context.env))) {
    return errorJson('Owner sign-in required. Please log in again.', 401);
  }
  if (!sameOrigin(context.request)) return errorJson('Request origin could not be verified.', 403);
  return null;
}

export async function getAppConfig(env) {
  const row = await env.DB.prepare('SELECT value_json FROM app_settings WHERE setting_key = ?').bind('app').first();
  if (!row?.value_json) throw new Error('App settings are missing. Apply migrations/schema.sql first.');
  return JSON.parse(row.value_json);
}

export async function saveAppConfig(env, config) {
  await env.DB.prepare(
    'INSERT INTO app_settings (setting_key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP'
  ).bind('app', JSON.stringify(config)).run();
}

export function mapProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    price: Number(row.price),
    desc: row.description || '',
    category: row.category || 'Other',
    available: Boolean(row.available),
    emoji: row.emoji || '🍰',
    image: row.image || '',
    sortOrder: Number(row.sort_order || 0),
  };
}

export function mapOrder(row) {
  let items = [];
  try { items = JSON.parse(row.items_json || '[]'); } catch { items = []; }
  return {
    id: Number(row.id),
    name: row.customer_name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    pin: row.pin,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    status: row.status,
    items,
    createdAt: row.created_at,
  };
}

export function validImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  if (value === '') return '';
  if (/^\/api\/images\/[0-9a-f-]{36}$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* invalid image URL */ }
  return '';
}

export function publicProductBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Product details are required.');
  const name = String(body.name || '').trim();
  const price = Number(body.price);
  const description = String(body.desc ?? body.description ?? '').trim();
  const category = String(body.category || 'Other').trim();
  const emoji = String(body.emoji || '🍰').trim().slice(0, 16);
  if (!name || name.length > 100) throw new Error('Item name must be 1–100 characters.');
  if (!Number.isFinite(price) || price < 0 || price > 1000000) throw new Error('Enter a valid item price.');
  if (description.length > 500) throw new Error('Description must be 500 characters or fewer.');
  if (!category || category.length > 50) throw new Error('Category must be 1–50 characters.');
  const image = validImageUrl(body.image || '');
  if (body.image && !image) throw new Error('Image URL is not valid. Upload the picture again.');
  return { name, price, description, category, emoji, image, available: body.available !== false };
}
