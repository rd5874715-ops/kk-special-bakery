import { json, clearSessionCookie, sameOrigin } from '../_lib/common.js';

export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return json({ error: 'Request origin could not be verified.' }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
