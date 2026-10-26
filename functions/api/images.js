import { errorJson, json, requireOwner } from '../_lib/common.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function onRequestPost(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  const { request, env } = context;
  if (!env.BAKERY_IMAGES) return errorJson('Image storage is not configured. Bind an R2 bucket named BAKERY_IMAGES.', 503);
  let form;
  try { form = await request.formData(); }
  catch { return errorJson('Choose an image file and try again.', 400); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return errorJson('Image file is missing.', 400);
  if (!allowedTypes.has(file.type)) return errorJson('Use a JPG, PNG, WebP or GIF image.', 415);
  if (file.size < 1 || file.size > 5 * 1024 * 1024) return errorJson('Image must be smaller than 5 MB.', 413);
  const key = `${crypto.randomUUID()}`;
  try {
    await env.BAKERY_IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { originalName: String(file.name || 'image').slice(0, 120) },
    });
    return json({ url: `/api/images/${key}`, key }, 201);
  } catch (error) {
    return errorJson(`Could not store image: ${String(error?.message || error)}`, 500);
  }
}
