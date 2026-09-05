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

  let stars = toInt(body.stars);
  if (!Number.isFinite(stars)) stars = 5;
  stars = Math.min(5, Math.max(1, stars));

  const tag      = String(body.tag ?? '').trim() || null;
  const gradient = String(body.gradient ?? '').trim() || DEFAULT_GRADIENT;
  const description = String(body.description ?? '').trim().slice(0, 2000) || null;

  const value = {
    id: String(body.id ?? '').trim() || null,
    name, brand, cat, condition, price, old, description, tag, tagType, stars,
    sizes:  toStringArray(body.sizes),
    colors: toStringArray(body.colors),
    gradient,
  };
  return { value };
}

// Short, collision-resistant product id for admin-created items.
export function genId() {
  return 'p-' + crypto.randomBytes(4).toString('hex');
}
