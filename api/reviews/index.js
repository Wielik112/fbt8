import { ensureSchema, listReviews, insertReview, dbErrorMessage } from '../_lib/db.js';
import { readJsonBody } from '../_lib/auth.js';
import { normalizeReview } from '../_lib/validate.js';

// GET  /api/reviews  -> public list of customer reviews
// POST /api/reviews  -> add a review (public — customers submit their own)
export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const reviews = await listReviews();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(reviews);
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const { value, error } = normalizeReview(body);
      if (error) return res.status(400).json({ error });
      const created = await insertReview(value);
      return res.status(201).json(created);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  } catch (err) {
    console.error('[api/reviews]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
