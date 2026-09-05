import crypto from 'node:crypto';

export const CATEGORIES  = ['Koszulki', 'Bluzy', 'Spodnie', 'Kurtki', 'Obuwie', 'Akcesoria'];
export const CONDITIONS  = ['Nowy', 'Używany'];
export const TAG_TYPES   = ['sale', 'hit', 'new'];
const DEFAULT_GRADIENT   = 'linear-gradient(135deg,#2a0409,#1c1c22)';

function toStringArray(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

// Accepts an image reference: a data: URL (uploaded photo) or an http(s) URL.
// Anything else is dropped. Length is capped to keep DB rows sane.
const MAX_IMG_LEN = 8_000_000; // ~8 MB of base64 per image
function cleanImage(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.length > MAX_IMG_LEN) return '';
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

function toImageArray(v) {
  const arr = Array.isArray(v) ? v : [];
  return arr.map(cleanImage).filter(Boolean).slice(0, 8); // max 8 gallery photos
}

function toInt(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : NaN;
}

// Validates + coerces an incoming product payload into the canonical shape.
// Returns { value } on success or { error } with a human-readable message.
export function normalizeProduct(body) {
  if (!body || typeof body !== 'object') return { error: 'Brak danych produktu.' };

  const name  = String(body.name ?? '').trim();
  const brand = String(body.brand ?? '').trim();
  const cat   = String(body.cat ?? '').trim();
  const price = toInt(body.price);

  if (!name)  return { error: 'Nazwa jest wymagana.' };
  if (!brand) return { error: 'Marka jest wymagana.' };
  if (!CATEGORIES.includes(cat)) return { error: `Kategoria musi być jedną z: ${CATEGORIES.join(', ')}.` };
  if (!Number.isFinite(price) || price < 0) return { error: 'Cena musi być liczbą nieujemną.' };

  let condition = String(body.condition ?? '').trim();
  if (!CONDITIONS.includes(condition)) condition = 'Nowy';

  let tagType = String(body.tagType ?? '').trim();
  if (!TAG_TYPES.includes(tagType)) tagType = 'sale';

  let old = body.old === '' || body.old == null ? null : toInt(body.old);
  if (old != null && (!Number.isFinite(old) || old < 0)) old = null;

  const tag      = String(body.tag ?? '').trim() || null;
  const gradient = String(body.gradient ?? '').trim() || DEFAULT_GRADIENT;
  const description = String(body.description ?? '').trim().slice(0, 2000) || null;
  const image  = cleanImage(body.image);
  const images = toImageArray(body.images);

  const value = {
    id: String(body.id ?? '').trim() || null,
    name, brand, cat, condition, price, old, description, tag, tagType,
    sizes:  toStringArray(body.sizes),
    colors: toStringArray(body.colors),
    image, images,
    gradient,
  };
  return { value };
}

// Short, collision-resistant product id for admin-created items.
export function genId() {
  return 'p-' + crypto.randomBytes(4).toString('hex');
}
