import { ensureSchema, getProduct, updateProduct, deleteProduct, dbErrorMessage } from '../_lib/db.js';
import { isAdmin, readJsonBody } from '../_lib/auth.js';
import { normalizeProduct } from '../_lib/validate.js';

// Product payloads can include base64-encoded photos, so lift the default
// 1 MB body-parser limit (the platform still caps the request at ~4.5 MB).
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

// GET    /api/products/:id  -> single product (public)
// PUT    /api/products/:id  -> update a product (admin only)
// DELETE /api/products/:id  -> delete a product (admin only)
export default async function handler(req, res) {
  const id = String(req.query?.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Brak ID produktu.' });

  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const product = await getProduct(id);
      if (!product) return res.status(404).json({ error: 'Nie znaleziono produktu.' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(product);
    }

    if (req.method === 'PUT') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });
      const body = await readJsonBody(req);
      const { value, error } = normalizeProduct(body);
      if (error) return res.status(400).json({ error });
      const updated = await updateProduct(id, value);
      if (!updated) return res.status(404).json({ error: 'Nie znaleziono produktu.' });
      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });
      const ok = await deleteProduct(id);
      if (!ok) return res.status(404).json({ error: 'Nie znaleziono produktu.' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  } catch (err) {
    console.error('[api/products/:id]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
