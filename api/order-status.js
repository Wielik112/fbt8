import { ensureOrdersSchema, getOrderBySession } from './_lib/orders.js';
import { dbErrorMessage } from './_lib/db.js';

// GET /api/order-status?session_id=cs_...
// Public confirmation lookup for the thank-you page. Keyed by the Stripe
// Checkout session id (a long, unguessable token the buyer just received).
// Returns only a minimal, buyer-appropriate summary.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  const sessionId = String(req.query?.session_id ?? '').trim();
  if (!sessionId.startsWith('cs_')) return res.status(400).json({ error: 'Brak identyfikatora sesji.' });

  try {
    await ensureOrdersSchema();
    const order = await getOrderBySession(sessionId);
    if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      currency: order.currency,
      itemsCount: order.items.reduce((s, i) => s + (i.qty || 0), 0),
      email: order.customer.email,
      shippingLabel: order.shippingLabel,
    });
  } catch (err) {
    console.error('[api/order-status]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
