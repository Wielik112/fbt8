import { ensureSchema, deleteReview, dbErrorMessage } from '../_lib/db.js';
import { isAdmin } from '../_lib/auth.js';

// DELETE /api/reviews/:id  -> remove a review (admin only)
export default async function handler(req, res) {
  const id = String(req.query?.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Brak ID opinii.' });

  try {
    await ensureSchema();

    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });
      const ok = await deleteReview(id);
      if (!ok) return res.status(404).json({ error: 'Nie znaleziono opinii.' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  } catch (err) {
    console.error('[api/reviews/:id]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
