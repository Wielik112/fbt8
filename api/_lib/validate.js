import crypto from 'node:crypto';

// Kategorie = „liście" drzewa (patrz js/categories.js). `cat` produktu to podkategoria.
// Drzewo (grupowanie w UI): Obuwie {Buty, Buty sportowe, Trampki},
// Odzież {Kurtki, Bluzy, Spodnie, Dresy sportowe, Czapki},
// Piłka nożna {Buty piłkarskie, Rękawice bramkarskie, Akcesoria piłkarskie}.
export const CATEGORIES  = [
  'Buty', 'Buty sportowe', 'Trampki',
  'Koszulki', 'Kurtki', 'Bluzy', 'Spodnie', 'Dresy sportowe', 'Czapki',
  'Buty piłkarskie', 'Rękawice bramkarskie', 'Akcesoria piłkarskie',
];
// Legacy — rodzaj odzieży (dawne pole; teraz podkategoria = cat). Zachowane dla zgodności.
export const GARMENTS    = ['Kurtki', 'Bluzy', 'Spodnie', 'Dresy sportowe', 'Czapki'];
export const CONDITIONS  = ['Nowy']; // sklep sprzedaje wyłącznie nowe produkty (Kategoria A)
export const GENDERS     = ['Męskie', 'Damskie', 'Unisex'];
export const TAG_TYPES   = ['sale', 'hit', 'new'];

// Poziom zaawansowania — istotny głównie dla butów piłkarskich.
export const LEVELS = ['Rekreacyjne', 'Treningowe', 'Półprofesjonalne', 'Profesjonalne'];
// Przeznaczenie (rodzaj nawierzchni) — dla butów piłkarskich.
export const SURFACES = [
  'Na trawę (lanki)',
  'Na sztuczną trawę/orlika (turfy)',
  'Na mokrą trawę (wkręty/mixy)',
  'Na halę (halówki)',
];
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

// Stan magazynowy per rozmiar: mapa { rozmiar: liczba_sztuk }.
// Zachowujemy tylko klucze będące w liście rozmiarów produktu; wartość to
// nieujemna liczba całkowita. Brak wpisu dla rozmiaru = ilość nieokreślona
// (bez limitu — zachowanie zgodne wstecz z produktami sprzed tej funkcji).
function toStockMap(v, sizes) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const key of Object.keys(v)) {
    const size = String(key).trim();
    if (!size || !sizes.includes(size)) continue;
    const n = Math.round(Number(v[key]));
    if (Number.isFinite(n) && n >= 0) out[size] = Math.min(n, 100000);
  }
  return out;
}

// Ceny per rozmiar: mapa { rozmiar: cena_zł }. Nadpisuje cenę bazową tylko
// dla wybranych rozmiarów. Brak wpisu = rozmiar w cenie bazowej produktu.
function toPriceMap(v, sizes) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const key of Object.keys(v)) {
    const size = String(key).trim();
    if (!size || !sizes.includes(size)) continue;
    const n = Math.round(Number(v[key]));
    if (Number.isFinite(n) && n >= 0) out[size] = Math.min(n, 1000000);
  }
  return out;
}

// Specyfikacja produktu: lista par { k: cecha, v: wartość } — np.
// { k: 'Podeszwa', v: 'Guma' }. Renderowana jako czytelna lista na stronie.
function toSpecList(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const k = String(item.k ?? item.label ?? '').trim().slice(0, 60);
    const val = String(item.v ?? item.value ?? '').trim().slice(0, 200);
    if (k && val) out.push({ k, v: val });
    if (out.length >= 30) break;
  }
  return out;
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

  // Zaawansowanie i przeznaczenie — opcjonalne (używane dla butów piłkarskich).
  let level = String(body.level ?? '').trim();
  if (!LEVELS.includes(level)) level = '';
  let surface = String(body.surface ?? '').trim();
  if (!SURFACES.includes(surface)) surface = '';

  let garment = String(body.garment ?? '').trim();
  if (!GARMENTS.includes(garment)) garment = '';

  let gender = String(body.gender ?? '').trim();
  if (!GENDERS.includes(gender)) gender = 'Unisex';

  let tagType = String(body.tagType ?? '').trim();
  if (!TAG_TYPES.includes(tagType)) tagType = 'sale';

  let old = body.old === '' || body.old == null ? null : toInt(body.old);
  if (old != null && (!Number.isFinite(old) || old < 0)) old = null;

  const tag      = String(body.tag ?? '').trim() || null;
  // Kod produktu z metki/pudełka (EAN / kod producenta) — do weryfikacji oryginalności.
  const code     = String(body.code ?? '').trim().slice(0, 80) || null;
  const gradient = String(body.gradient ?? '').trim() || DEFAULT_GRADIENT;
  const description = String(body.description ?? '').trim().slice(0, 2000) || null;
  // Uwagi outletowe / cechy charakterystyczne egzemplarza (np. uszkodzone opakowanie).
  const note = String(body.note ?? '').trim().slice(0, 1000) || null;
  // Wyróżnienie na stronie głównej (sekcja Bestsellery).
  const featured = body.featured === true || body.featured === 'true' || body.featured === 'on' || body.featured === 1;
  const image  = cleanImage(body.image);
  const images = toImageArray(body.images);

  const sizes = toStringArray(body.sizes);
  const value = {
    id: String(body.id ?? '').trim() || null,
    name, brand, cat, condition, gender, price, old, description, note, tag, tagType, code,
    level, surface, garment, featured,
    sizes,
    stock:  toStockMap(body.stock, sizes),
    prices: toPriceMap(body.prices, sizes),
    specs:  toSpecList(body.specs),
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

// Validates + coerces an incoming customer review payload.
export function normalizeReview(body) {
  if (!body || typeof body !== 'object') return { error: 'Brak danych opinii.' };

  const orderNo = String(body.orderNo ?? body.order_no ?? '').trim();
  const text    = String(body.body ?? body.text ?? '').trim();
  let rating    = Math.round(Number(body.rating));

  if (!orderNo) return { error: 'Podaj numer zamówienia.' };
  if (orderNo.length > 60) return { error: 'Numer zamówienia jest za długi.' };
  if (!text) return { error: 'Napisz treść opinii.' };
  if (!Number.isFinite(rating)) rating = 5;
  rating = Math.min(5, Math.max(1, rating));

  return { value: { id: 'r-' + crypto.randomBytes(4).toString('hex'), orderNo, rating, body: text.slice(0, 1000) } };
}
