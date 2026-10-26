import { json, readJson, sameOrigin, passwordMatches, makeSessionToken, sessionCookie } from '../_lib/common.js';

const encoder = new TextEncoder();
async function fingerprintIp(ip, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(ip || 'unknown')));
  return Array.from(signed, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ error: 'Request origin could not be verified.' }, 403);
  if (!env.DB || !env.OWNER_PASSWORD || String(env.OWNER_PASSWORD).length < 12 || !env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) {
    return json({ error: 'Owner login is not configured yet. Set up D1, OWNER_PASSWORD (at least 12 characters) and SESSION_SECRET in Cloudflare.' }, 503);
  }
  let body;
  try { body = await readJson(request); } catch (error) { return json({ error: error.message }, 400); }

  try {
    const ipKey = await fingerprintIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.SESSION_SECRET);
    const attempts = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM login_attempts WHERE ip_hash = ? AND attempted_at > unixepoch() - 900"
    ).bind(ipKey).first();
    if (Number(attempts?.total || 0) >= 10) {
      return json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' }, 429, { 'Retry-After': '900' });
    }
    await env.DB.prepare('INSERT INTO login_attempts (ip_hash) VALUES (?)').bind(ipKey).run();
    await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < unixepoch() - 86400').run();
    if (!passwordMatches(body?.password, env.OWNER_PASSWORD)) {
      return json({ error: 'Incorrect owner password.' }, 401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(ipKey).run();
    const token = await makeSessionToken(env.SESSION_SECRET);
    return json({ ok: true, expiresInSeconds: 43200 }, 200, { 'Set-Cookie': sessionCookie(token) });
  } catch (error) {
    return json({ error: `Owner login could not be completed: ${String(error?.message || error)}` }, 500);
  }
}
