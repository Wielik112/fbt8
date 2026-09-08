import { ensureSchema, seedIfEmpty, listProducts, insertProduct, dbErrorMessage } from '../_lib/db.js';
import { isAdmin, readJsonBody } from '../_lib/auth.js';
import { normalizeProduct, genId } from '../_lib/validate.js';

// Product payloads can include base64-encoded photos, so lift the default
// 1 MB body-parser limit (the platform still caps the request at ~4.5 MB).
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

// GET  /api/products  -> public list of products (seeds on first run)
// POST /api/products  -> create a product (admin only)
export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      await seedIfEmpty();
      const products = await listProducts();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(products);
    }

    if (req.method === 'POST') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });
      const body = await readJsonBody(req);
      const { value, error } = normalizeProduct(body);
      if (error) return res.status(400).json({ error });
      if (!value.id) value.id = genId();
      const created = await insertProduct(value);
      return res.status(201).json(created);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Produkt o tym ID już istnieje.' });
    console.error('[api/products]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
