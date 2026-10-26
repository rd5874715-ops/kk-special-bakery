import { errorJson, json, getAppConfig, readJson, requireOwner, saveAppConfig, validImageUrl } from '../_lib/common.js';

function text(value, max) { return String(value ?? '').trim().slice(0, max); }

export async function onRequestPut(context) {
  const denied = await requireOwner(context);
  if (denied) return denied;
  let body;
  try { body = await readJson(context.request); }
  catch (error) { return errorJson(error.message, 400); }
  try {
    const current = await getAppConfig(context.env);
    const incomingSettings = body.settings && typeof body.settings === 'object' ? body.settings : {};
    const incomingBrand = body.siteBranding && typeof body.siteBranding === 'object' ? body.siteBranding : {};
    const settings = {
      deliveryFee: Math.max(0, Math.min(100000, Number(incomingSettings.deliveryFee ?? current.settings.deliveryFee) || 0)),
      freeDeliveryAbove: Math.max(0, Math.min(1000000, Number(incomingSettings.freeDeliveryAbove ?? current.settings.freeDeliveryAbove) || 0)),
      address: text(incomingSettings.address ?? current.settings.address, 300),
      phone: text(incomingSettings.phone ?? current.settings.phone, 30),
      hours: text(incomingSettings.hours ?? current.settings.hours, 100),
      serviceArea: text(incomingSettings.serviceArea ?? current.settings.serviceArea, 300),
    };
    const brand = {
      name: text(incomingBrand.name ?? current.siteBranding.name, 100),
      tag: text(incomingBrand.tag ?? current.siteBranding.tag, 180),
      hero: text(incomingBrand.hero ?? current.siteBranding.hero, 160),
      text: text(incomingBrand.text ?? current.siteBranding.text, 500),
      logo: validImageUrl(incomingBrand.logo ?? current.siteBranding.logo ?? ''),
      storePhoto: validImageUrl(incomingBrand.storePhoto ?? current.siteBranding.storePhoto ?? ''),
    };
    if (incomingBrand.logo && !brand.logo) return errorJson('Bakery logo URL is invalid. Upload the picture again.', 400);
    if (incomingBrand.storePhoto && !brand.storePhoto) return errorJson('Store photo URL is invalid. Upload the picture again.', 400);
    const accent = /^#[0-9a-f]{6}$/i.test(String(body.accent || '')) ? String(body.accent) : current.accent;
    const background = /^#[0-9a-f]{6}$/i.test(String(body.background || '')) ? String(body.background) : current.background;
    const next = { settings, siteBranding: brand, accent, background };
    await saveAppConfig(context.env, next);
    return json({ ok: true, config: next });
  } catch (error) {
    return errorJson(`Could not save bakery settings: ${String(error?.message || error)}`, 500);
  }
}
