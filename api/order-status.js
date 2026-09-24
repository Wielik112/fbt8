import { ensureOrdersSchema, getOrderBySession, getOrderForCustomer } from './_lib/orders.js';
import { dbErrorMessage } from './_lib/db.js';
import { trackingUrlFor } from './_lib/commerce.js';
import { refreshShipmentForOrder } from './_lib/shipping.js';
import { syncPaymentFromStripe } from './_lib/payments.js';

// GET /api/order-status?session_id=cs_...
// Public confirmation lookup for the thank-you page. Keyed by the Stripe
// Checkout session id (a long, unguessable token the buyer just received).
// Returns only a minimal, buyer-appropriate summary.
//
// GET /api/order-status?order=FBT-...&email=...
// Tracking lookup for /sledzenie: needs the order number AND the e-mail it
// was placed with. Returns shipment status, tracking number and events.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }
  if (req.query?.order !== undefined) return trackHandler(req, res);

  const sessionId = String(req.query?.session_id ?? '').trim();
  if (!sessionId.startsWith('cs_')) return res.status(400).json({ error: 'Brak identyfikatora sesji.' });

  try {
    await ensureOrdersSchema();
    // Thank-you page: if the webhook hasn't landed yet, ask Stripe directly.
    const order = await syncPaymentFromStripe(await getOrderBySession(sessionId));
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

const PUBLIC_STATUS = {
  pending: 'Oczekuje na płatność', paid: 'Opłacone — przygotowujemy paczkę',
  fulfilled: 'Paczka przygotowana do nadania', shipped: 'Wysłane', completed: 'Doręczone',
  cancelled: 'Anulowane',
};

async function trackHandler(req, res) {
  const id = String(req.query?.order ?? '').trim().toUpperCase();
  const email = String(req.query?.email ?? '').trim();
  if (!/^FBT-\d{8}-[0-9A-F]{6}$/.test(id) || !email.includes('@')) {
    return res.status(400).json({ error: 'Podaj numer zamówienia (np. FBT-20260908-9F3AC2) i e-mail z zamówienia.' });
  }
  try {
    await ensureOrdersSchema();
    let order = await getOrderForCustomer(id, email);
    if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia o tym numerze i adresie e-mail.' });

    // Fresh carrier data when a label exists (best-effort, never fails the
    // lookup), at most every 5 minutes so the page can't hammer the carrier API.
    const stale = Date.now() - new Date(order.updatedAt).getTime() > 5 * 60_000;
    if (stale && order.shipment?.id && (order.shipment.ordered || order.shipment.provider === 'inpost')) {
      try { order = await refreshShipmentForOrder(order); } catch (err) { console.warn('[order-status] refresh', err?.message); }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      id: order.id,
      status: order.status,
      statusLabel: PUBLIC_STATUS[order.status] || order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      shippingLabel: order.shippingLabel,
      point: order.inpostPoint || null,
      pointName: order.pointName || null,
      trackingNumber: order.trackingNumber || null,
      trackingUrl: trackingUrlFor(order.shippingMethod, order.trackingNumber),
      events: (order.shipment?.events || []).slice(0, 15),
    });
  } catch (err) {
    console.error('[api/order-status track]', err);
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}
