import { sql } from '@vercel/postgres';
import { SEED_PRODUCTS } from './seed-data.js';

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
      (id, name, cat, brand, condition, price, old_price, tag, tag_type, stars, sizes, colors, gradient, sort_order)
    VALUES
      (${p.id}, ${p.name}, ${p.cat}, ${p.brand}, ${p.condition}, ${p.price}, ${p.old},
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
      price = ${p.price}, old_price = ${p.old}, tag = ${p.tag}, tag_type = ${p.tagType},
      stars = ${p.stars},
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

// Turns raw driver errors into an actionable message when the DB is missing.
export function dbErrorMessage(err) {
  const msg = String(err?.message || err || '');
  if (/missing_connection_string|POSTGRES_URL|connect/i.test(msg)) {
    return 'Baza danych nie jest skonfigurowana. Podłącz Vercel Postgres do projektu (Storage → Postgres).';
  }
  return 'Błąd serwera bazy danych.';
}
