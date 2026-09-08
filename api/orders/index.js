import { ensureOrdersSchema, listOrders, orderStats } from '../_lib/orders.js';
import { isAdmin } from '../_lib/auth.js';
import { dbErrorMessage } from '../_lib/db.js';
import { ORDER_STATUSES } from '../_lib/commerce.js';

// GET /api/orders?status=&limit=&offset=&stats=1  (admin only)
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }
  if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });

  try {
    await ensureOrdersSchema();
    const status = req.query?.status && ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
    const limit = req.query?.limit ? Number(req.query.limit) : 25;
    const offset = req.query?.offset ? Number(req.query.offset) : 0;

    const result = await listOrders({ status, limit, offset });
    if (req.query?.stats) result.stats = await orderStats();

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[api/orders]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
