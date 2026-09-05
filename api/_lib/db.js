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
async function sql(strings, ...values) {
  let text = '';
  strings.forEach((s, i) => {
    text += s;
    if (i < values.length) text += '$' + (i + 1);
  });
  return getPool().query(text, values);
}

let schemaReady = false;

// Creates the products table on first use. CREATE TABLE IF NOT EXISTS is
// cheap, and the in-process guard skips repeat calls within a warm function.
export async function ensureSchema() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      cat         TEXT NOT NULL,
      brand       TEXT NOT NULL,
      condition   TEXT NOT NULL DEFAULT 'Nowy',
      price       INTEGER NOT NULL,
      old_price   INTEGER,
      description TEXT,
      tag         TEXT,
      tag_type    TEXT,
      stars       INTEGER NOT NULL DEFAULT 5,
      sizes       JSONB NOT NULL DEFAULT '[]'::jsonb,
      colors      JSONB NOT NULL DEFAULT '[]'::jsonb,
      gradient    TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // Migration for databases created before `description` existed.
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT`;
  schemaReady = true;
}

// Seeds the initial catalog exactly once, when the table is still empty.
export async function seedIfEmpty() {
  const { rows } = await sql`SELECT COUNT(*)::int AS n FROM products`;
  if (rows[0].n > 0) return;
  let order = 0;
  for (const p of SEED_PRODUCTS) {
    await insertProduct({ ...p }, order++);
  }
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
    price: r.price,
    old: r.old_price,
    description: r.description || '',
    tag: r.tag,
    tagType: r.tag_type,
    stars: r.stars,
    sizes: r.sizes || [],
    colors: r.colors || [],
    gradient: r.gradient,
  };
}

export async function listProducts() {
  const { rows } = await sql`SELECT * FROM products ORDER BY sort_order ASC, created_at ASC`;
  return rows.map(mapRow);
}

export async function getProduct(id) {
  const { rows } = await sql`SELECT * FROM products WHERE id = ${id}`;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function insertProduct(p, sortOrder = null) {
  const order = sortOrder == null ? await nextSortOrder() : sortOrder;
  const { rows } = await sql`
    INSERT INTO products
      (id, name, cat, brand, condition, price, old_price, description, tag, tag_type, stars, sizes, colors, gradient, sort_order)
    VALUES
      (${p.id}, ${p.name}, ${p.cat}, ${p.brand}, ${p.condition}, ${p.price}, ${p.old}, ${p.description || null},
       ${p.tag}, ${p.tagType}, ${p.stars},
       ${JSON.stringify(p.sizes || [])}::jsonb, ${JSON.stringify(p.colors || [])}::jsonb,
       ${p.gradient}, ${order})
    RETURNING *`;
  return mapRow(rows[0]);
}

export async function updateProduct(id, p) {
  const { rows } = await sql`
    UPDATE products SET
      name = ${p.name}, cat = ${p.cat}, brand = ${p.brand}, condition = ${p.condition},
      price = ${p.price}, old_price = ${p.old}, description = ${p.description || null},
      tag = ${p.tag}, tag_type = ${p.tagType}, stars = ${p.stars},
      sizes = ${JSON.stringify(p.sizes || [])}::jsonb,
      colors = ${JSON.stringify(p.colors || [])}::jsonb,
      gradient = ${p.gradient}, updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteProduct(id) {
  const { rowCount } = await sql`DELETE FROM products WHERE id = ${id}`;
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
