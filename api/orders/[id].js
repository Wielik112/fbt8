import { ensureOrdersSchema, getOrder, updateOrderAdmin } from '../_lib/orders.js';
import { isAdmin, readJsonBody } from '../_lib/auth.js';
import { dbErrorMessage } from '../_lib/db.js';
import { ADMIN_SETTABLE_STATUSES } from '../_lib/commerce.js';

// GET   /api/orders/:id  -> full order (admin)
// PATCH /api/orders/:id  -> update status / tracking_number / notes (admin)
export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });

  const id = String(req.query?.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Brak ID zamówienia.' });

  try {
    await ensureOrdersSchema();

    if (req.method === 'GET') {
      const order = await getOrder(id);
      if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(order);
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const fields = {};

      if (body.status !== undefined) {
        if (!ADMIN_SETTABLE_STATUSES.includes(body.status)) {
          return res.status(400).json({ error: `Status musi być jednym z: ${ADMIN_SETTABLE_STATUSES.join(', ')}.` });
        }
        fields.status = body.status;
      }
      if (body.trackingNumber !== undefined) {
        fields.trackingNumber = String(body.trackingNumber).trim() || null;
      }
      if (body.notes !== undefined) {
        fields.notes = String(body.notes).trim().slice(0, 2000) || null;
      }
      if (!Object.keys(fields).length) return res.status(400).json({ error: 'Brak zmian do zapisania.' });

      const updated = await updateOrderAdmin(id, fields);
      if (!updated) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });
      return res.status(200).json(updated);
    }

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  } catch (err) {
    console.error('[api/orders/:id]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
