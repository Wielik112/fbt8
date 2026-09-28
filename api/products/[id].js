import {
  ensureSchema, getProductPublic, getProductImage, updateProduct, deleteProduct, resolveImageRefs, dbErrorMessage,
} from '../_lib/db.js';
import { isAdmin, readJsonBody } from '../_lib/auth.js';
import { normalizeProduct } from '../_lib/validate.js';

// Product payloads can include base64-encoded photos, so lift the default
// 1 MB body-parser limit (the platform still caps the request at ~4.5 MB).
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

// GET    /api/products/:id           -> single product (public, photos as URLs)
// GET    /api/products/:id?img=main  -> main photo as an image file (also ?img=0..7 for the gallery)
// PUT    /api/products/:id           -> update a product (admin only)
// DELETE /api/products/:id           -> delete a product (admin only)
export default async function handler(req, res) {
  const id = String(req.query?.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Brak ID produktu.' });

  try {
    await ensureSchema();

    if (req.method === 'GET' && req.query?.img != null) return await imageHandler(res, id, String(req.query.img));

    if (req.method === 'GET') {
      const product = await getProductPublic(id);
      if (!product) return res.status(404).json({ error: 'Nie znaleziono produktu.' });
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
      return res.status(200).json(product);
    }
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'PUT') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });
      const body = await resolveImageRefs(await readJsonBody(req));
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

// Serves a stored data: URL photo as a real image. URLs carry ?v=<updated_at>,
// so the response can be cached for a year: an edit produces a new URL.
async function imageHandler(res, id, key) {
  const src = await getProductImage(id, key);
  if (!src) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ error: 'Brak zdjęcia.' }); }
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(src);
  if (!m) {
    // Stored as an external URL — just point the browser there.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Location', src);
    return res.status(302).end();
  }
  const buf = Buffer.from(m[2], 'base64');
  res.setHeader('Content-Type', /^image\//i.test(m[1]) ? m[1] : 'application/octet-stream');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.statusCode = 200;
  return res.end(buf);
}
