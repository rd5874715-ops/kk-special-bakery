import { errorJson, json, requireOwner, sameOrigin } from '../../_lib/common.js';

function validKey(key) { return /^[0-9a-f-]{36}$/i.test(String(key || '')); }

export async function onRequestGet({ params, env }) {
  if (!env.BAKERY_IMAGES) return errorJson('Image storage is not configured.', 503);
  if (!validKey(params.key)) return errorJson('Image not found.', 404);
  const object = await env.BAKERY_IMAGES.get(params.key);
  if (!object) return errorJson('Image not found.', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(object.body, { headers });
}

export async function onRequestDelete(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  if (!sameOrigin(context.request)) return errorJson('Request origin could not be verified.', 403);
  if (!validKey(context.params.key)) return errorJson('Image key is not valid.', 400);
  await context.env.BAKERY_IMAGES.delete(context.params.key);
  return json({ ok: true });
}
