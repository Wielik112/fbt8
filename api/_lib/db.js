import pg from 'pg';
import { SEED_PRODUCTS } from './seed-data.js';

const { Pool } = pg;

// Accept whatever connection string the platform provides. Different Vercel /
// Neon integrations name it differently, so we probe the common variants.
// The plain `pg` driver accepts pooled OR direct URLs, unlike @vercel/postgres.
const CONN_VARS = [
  'POSTGRES_URL',
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NO_SSL',
  'PGURL',
];

export function connectionString() {
  for (const name of CONN_VARS) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

// Names (never values) of DB-related env vars that are present. Safe to surface
// for diagnostics — helps spot a misnamed or missing connection variable.
export function detectedDbVars() {
  return Object.keys(process.env)
    .filter((k) => /^(POSTGRES|DATABASE|NEON|PG)[A-Z_]*$/i.test(k))
    .sort();
}

let pool;
function getPool() {
  if (pool) return pool;
  const cs = connectionString();
  if (!cs) {
    const err = new Error('missing_connection_string');
    err.code = 'NO_DB_CONNECTION';
    throw err;
  }
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(cs);
  pool = new Pool({
    connectionString: cs,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Hosted Postgres (Neon/Vercel/Supabase) requires TLS. rejectUnauthorized
    // is relaxed because serverless runtimes don't ship the provider CA chain.
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('[pg pool]', e));
  return pool;
}

// Tagged-template runner: `` sql`SELECT ... ${v}` `` -> parameterized query.
// Literal text between interpolations (e.g. `::jsonb`) is preserved verbatim.
// Exported so other data modules (e.g. orders) share the same pool.
export async function sql(strings, ...values) {
  let text = '';
  strings.forEach((s, i) => {
    text += s;
    if (i < values.length) text += '$' + (i + 1);
  });
  return getPool().query(text, values);
}

// Runs a parameterless multi-statement SQL script in one round trip (simple
// query protocol). Only for fixed DDL/migrations — never with user input.
export async function sqlScript(text) {
  return getPool().query(text);
}

let schemaReady = false;
let schemaPromise = null;

// Creates / migrates the products and reviews tables on first use. All
// statements are idempotent and go to the database as ONE script (a single
// round trip instead of ~20), which keeps serverless cold starts fast. The
// in-process guard skips repeat calls within a warm function.
export async function ensureSchema() {
  if (schemaReady) return;
  schemaPromise ||= sqlScript(`
    CREATE TABLE IF NOT EXISTS products (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      cat         TEXT NOT NULL,
      brand       TEXT NOT NULL,
      condition   TEXT NOT NULL DEFAULT 'Nowy',
      gender      TEXT NOT NULL DEFAULT 'Unisex',
      level       TEXT,
      surface     TEXT,
      garment     TEXT,
      price       INTEGER NOT NULL,
      old_price   INTEGER,
      description TEXT,
      note        TEXT,
      featured    BOOLEAN NOT NULL DEFAULT false,
      tag         TEXT,
      tag_type    TEXT,
      stars       INTEGER NOT NULL DEFAULT 5,
      sizes       JSONB NOT NULL DEFAULT '[]'::jsonb,
      colors      JSONB NOT NULL DEFAULT '[]'::jsonb,
      image       TEXT,
      images      JSONB NOT NULL DEFAULT '[]'::jsonb,
      gradient    TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Migrations for databases created before these columns existed.
    ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'Unisex';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS level TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS surface TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS garment TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
    -- Darmowa dostawa dla zamówienia zawierającego ten produkt.
    ALTER TABLE products ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN NOT NULL DEFAULT false;
    -- Stan magazynowy per rozmiar: { rozmiar: liczba_sztuk }.
    ALTER TABLE products ADD COLUMN IF NOT EXISTS stock JSONB NOT NULL DEFAULT '{}'::jsonb;
    -- Ceny per rozmiar (nadpisania ceny bazowej): { rozmiar: cena }.
    ALTER TABLE products ADD COLUMN IF NOT EXISTS prices JSONB NOT NULL DEFAULT '{}'::jsonb;
    -- Kod produktu z metki/pudełka (EAN / kod producenta).
    ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;
    -- Specyfikacja produktu: lista { k, v } (np. Podeszwa → Guma).
    ALTER TABLE products ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '[]'::jsonb;
    -- Migracja kategorii do nowego drzewa (Obuwie / Odzież / Piłka nożna).
    -- Idempotentne — po pierwszym przebiegu żadne wiersze nie pasują.
    UPDATE products SET cat = garment WHERE cat = 'Odzież' AND garment IS NOT NULL AND garment <> '';
    UPDATE products SET cat = 'Akcesoria piłkarskie' WHERE cat IN ('Piłki', 'Akcesoria', 'Odzież');
    -- Zmiana nazwy poziomu zaawansowania: „Treningowe" → „Półamatorskie".
    -- Idempotentne — po pierwszym przebiegu żaden wiersz nie pasuje.
    UPDATE products SET level = 'Półamatorskie' WHERE level = 'Treningowe';
    -- Customer reviews (simple, public).
    CREATE TABLE IF NOT EXISTS reviews (
      id          TEXT PRIMARY KEY,
      order_no    TEXT NOT NULL,
      rating      INTEGER NOT NULL DEFAULT 5,
      body        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `).then(() => { schemaReady = true; }, (err) => { schemaPromise = null; throw err; });
  return schemaPromise;
}

// Seeds the initial catalog exactly once, when the table is still empty.
// Once a warm instance has seen products, later calls skip the query.
let catalogSeeded = false;
export async function seedIfEmpty() {
  if (catalogSeeded) return;
  const { rows } = await sql`SELECT EXISTS (SELECT 1 FROM products) AS has`;
  if (rows[0].has) { catalogSeeded = true; return; }
  let order = 0;
  for (const p of SEED_PRODUCTS) {
    await insertProduct({ ...p }, order++);
  }
  catalogSeeded = true;
}

// Lightweight connectivity check for the /api/health endpoint.
export async function ping() {
  const { rows } = await sql`SELECT 1 AS ping`;
  return rows?.[0]?.ping === 1;
}

// Maps a DB row to the shape the storefront + admin UI consume.
export function mapRow(r) {
  return {
    id: r.id,
    name: r.name,
    cat: r.cat,
    brand: r.brand,
    condition: r.condition,
    gender: r.gender || 'Unisex',
    level: r.level || '',
    surface: r.surface || '',
    garment: r.garment || '',
    price: r.price,
    old: r.old_price,
    description: r.description || '',
    note: r.note || '',
    featured: r.featured === true || r.featured === 't',
    freeShipping: r.free_shipping === true || r.free_shipping === 't',
    tag: r.tag,
    tagType: r.tag_type,
    sizes: r.sizes || [],
    stock: r.stock || {},
    prices: r.prices || {},
    specs: r.specs || [],
    code: r.code || '',
    colors: r.colors || [],
    image: r.image || '',
    images: r.images || [],
    gradient: r.gradient,
  };
}

export async function listProducts() {
  const { rows } = await sql`SELECT * FROM products ORDER BY sort_order ASC, created_at ASC`;
  return rows.map(mapRow);
}

// ---- Public (storefront) shape: photos as URLs instead of inline base64 ----
// Uploaded photos are stored as data: URLs, which made every catalog response
// carry every photo. The storefront gets short, versioned URLs instead
// (served by /api/products/:id?img=…), so the browser loads only the photos
// it shows, lazily, and caches them.
const imgVersion = (r) => Math.floor(new Date(r.updated_at || 0).getTime() / 1000);
function publicImage(r, raw, key) {
  const s = String(raw || '');
  if (!s) return '';
  if (!s.startsWith('data:')) return s; // already a URL
  return `/api/products/${encodeURIComponent(r.id)}?img=${key}&v=${imgVersion(r)}`;
}

// Catalog listing (storefront and admin panel). Photo data never leaves the
// database: each photo comes back as a URL, gallery included, so the panel's
// edit form keeps every photo (saving resolves the URLs via resolveImageRefs).
export async function listProductsPublic() {
  const { rows } = await sql`
    SELECT id, name, cat, brand, condition, gender, level, surface, garment, price, old_price,
           description, note, featured, free_shipping, tag, tag_type, code, sizes, stock, prices, specs, colors,
           gradient, updated_at,
           CASE WHEN left(image, 5) = 'data:' THEN 'data:' ELSE image END AS image,
           COALESCE((SELECT jsonb_agg(CASE WHEN left(e, 5) = 'data:' THEN 'data:' ELSE e END ORDER BY n)
                     FROM jsonb_array_elements_text(images) WITH ORDINALITY AS g(e, n)), '[]'::jsonb) AS images
    FROM products ORDER BY sort_order ASC, created_at ASC`;
  return rows.map(toPublicProduct);
}

export function toPublicProduct(r) {
  const images = Array.isArray(r.images) ? r.images : [];
  return {
    ...mapRow(r),
    image: publicImage(r, r.image, 'main'),
    images: images.map((src, i) => publicImage(r, src, i)).filter(Boolean),
  };
}

export async function getProductPublic(id) {
  const { rows } = await sql`SELECT * FROM products WHERE id = ${id}`;
  return rows[0] ? toPublicProduct(rows[0]) : null;
}

// A product saved with our own photo URLs (e.g. the public shape reached the
// panel) must keep its photos: swap each /api/products/:id?img=… reference
// back to the stored data before validation, which only accepts data:/http(s).
const OWN_IMG_RE = /^\/api\/products\/([^?]+)\?img=(main|\d+)/;
export async function resolveImageRefs(body) {
  if (!body || typeof body !== 'object') return body;
  const resolve = async (v) => {
    const m = OWN_IMG_RE.exec(String(v ?? ''));
    return m ? ((await getProductImage(decodeURIComponent(m[1]), m[2])) || '') : v;
  };
  const out = { ...body, image: await resolve(body.image) };
  if (Array.isArray(body.images)) out.images = await Promise.all(body.images.map(resolve));
  return out;
}

// Raw stored photo for the image endpoint: key 'main' or a gallery index.
export async function getProductImage(id, key) {
  if (key === 'main') {
    const { rows } = await sql`SELECT image AS src FROM products WHERE id = ${id}`;
    return rows[0]?.src || null;
  }
  const idx = Number(key);
  if (!Number.isInteger(idx) || idx < 0 || idx > 50) return null;
  const { rows } = await sql`SELECT images->>${idx}::int AS src FROM products WHERE id = ${id}`;
  return rows[0]?.src || null;
}

export async function getProduct(id) {
  const { rows } = await sql`SELECT * FROM products WHERE id = ${id}`;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function insertProduct(p, sortOrder = null) {
  const order = sortOrder == null ? await nextSortOrder() : sortOrder;
  const { rows } = await sql`
    INSERT INTO products
      (id, name, cat, brand, condition, gender, level, surface, garment, price, old_price, description, note, featured, free_shipping, tag, tag_type, code, sizes, stock, prices, specs, colors, image, images, gradient, sort_order)
    VALUES
      (${p.id}, ${p.name}, ${p.cat}, ${p.brand}, ${p.condition}, ${p.gender || 'Unisex'}, ${p.level || null}, ${p.surface || null}, ${p.garment || null}, ${p.price}, ${p.old}, ${p.description || null}, ${p.note || null}, ${p.featured === true}, ${p.freeShipping === true},
       ${p.tag}, ${p.tagType}, ${p.code || null},
       ${JSON.stringify(p.sizes || [])}::jsonb, ${JSON.stringify(p.stock || {})}::jsonb, ${JSON.stringify(p.prices || {})}::jsonb, ${JSON.stringify(p.specs || [])}::jsonb, ${JSON.stringify(p.colors || [])}::jsonb,
       ${p.image || null}, ${JSON.stringify(p.images || [])}::jsonb,
       ${p.gradient}, ${order})
    RETURNING *`;
  return mapRow(rows[0]);
}

export async function updateProduct(id, p) {
  const { rows } = await sql`
    UPDATE products SET
      name = ${p.name}, cat = ${p.cat}, brand = ${p.brand}, condition = ${p.condition},
      gender = ${p.gender || 'Unisex'}, level = ${p.level || null}, surface = ${p.surface || null}, garment = ${p.garment || null},
      price = ${p.price}, old_price = ${p.old}, description = ${p.description || null}, note = ${p.note || null}, featured = ${p.featured === true},
      free_shipping = ${p.freeShipping === true},
      tag = ${p.tag}, tag_type = ${p.tagType}, code = ${p.code || null},
      sizes = ${JSON.stringify(p.sizes || [])}::jsonb,
      stock = ${JSON.stringify(p.stock || {})}::jsonb,
      prices = ${JSON.stringify(p.prices || {})}::jsonb,
      specs = ${JSON.stringify(p.specs || [])}::jsonb,
      colors = ${JSON.stringify(p.colors || [])}::jsonb,
      image = ${p.image || null}, images = ${JSON.stringify(p.images || [])}::jsonb,
      gradient = ${p.gradient}, updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteProduct(id) {
  const { rowCount } = await sql`DELETE FROM products WHERE id = ${id}`;
  return rowCount > 0;
}

// Zmniejsza stan magazynowy danego rozmiaru po opłaceniu zamówienia.
// Działa tylko gdy rozmiar jest „zarządzany" (istnieje klucz w stock);
// nigdy nie schodzi poniżej 0. Rozmiary bez wpisu (nielimitowane) pomija.
export async function decrementStock(productId, size, qty) {
  const s = String(size ?? '').trim();
  const q = Math.round(Number(qty));
  if (!productId || !s || !Number.isFinite(q) || q <= 0) return;
  await sql`
    UPDATE products SET
      stock = jsonb_set(stock, ARRAY[${s}],
        to_jsonb(GREATEST(0, COALESCE((stock->>${s})::int, 0) - ${q})), false),
      updated_at = now()
    WHERE id = ${productId} AND jsonb_exists(stock, ${s})`;
}

// ---- Reviews ----
export function mapReview(r) {
  return { id: r.id, orderNo: r.order_no, rating: r.rating, body: r.body, createdAt: r.created_at };
}

export async function listReviews() {
  const { rows } = await sql`SELECT * FROM reviews ORDER BY created_at DESC`;
  return rows.map(mapReview);
}

export async function insertReview(rv) {
  const { rows } = await sql`
    INSERT INTO reviews (id, order_no, rating, body)
    VALUES (${rv.id}, ${rv.orderNo}, ${rv.rating}, ${rv.body})
    RETURNING *`;
  return mapReview(rows[0]);
}

export async function deleteReview(id) {
  const { rowCount } = await sql`DELETE FROM reviews WHERE id = ${id}`;
  return rowCount > 0;
}

async function nextSortOrder() {
  const { rows } = await sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM products`;
  return rows[0].n;
}

// Turns raw driver errors into an actionable message.
export function dbErrorMessage(err) {
  const msg = String(err?.message || err || '');
  if (err?.code === 'NO_DB_CONNECTION' || /missing_connection_string/i.test(msg)) {
    const found = detectedDbVars();
    const hint = found.length
      ? `Wykryto zmienne: ${found.join(', ')}, ale żadna nie zawiera prawidłowego connection stringa. Jeśli właśnie podłączono bazę — wykonaj Redeploy.`
      : 'Nie wykryto żadnej zmiennej połączenia. Podłącz bazę (Storage → Postgres) i wykonaj Redeploy projektu.';
    return `Baza danych nie jest skonfigurowana. ${hint}`;
  }
  return `Błąd bazy danych: ${msg || 'nieznany'}`;
}
