import { sql } from './db.js';
import { markPaid, markPaymentStatus, getOrder } from './orders.js';
import { getStripe, stripeConfigured } from './stripe.js';
import { onOrderPaid } from './fulfil.js';

// Payment reconciliation straight from Stripe. The webhook stays the primary
// path, but if it is missing / misconfigured (wrong STRIPE_WEBHOOK_SECRET,
// endpoint not added, test vs live mix-up) orders would sit "unpaid" forever.
// This asks Stripe for the Checkout Session and applies the same transitions.

// Returns the (possibly updated) order. Never throws.
export async function syncPaymentFromStripe(order) {
  if (!order || order.paymentStatus === 'paid' || !order.stripeSessionId || !stripeConfigured()) return order;
  try {
    const session = await getStripe().checkout.sessions.retrieve(order.stripeSessionId);
    if (session.payment_status === 'paid') {
      // markPaid returns the order only on the first transition, so
      // fulfilment (label + e-mail) still runs exactly once.
      const paid = await markPaid(order.id, { paymentIntent: session.payment_intent, total: session.amount_total });
      if (paid) return (await onOrderPaid(paid)) || paid;
      return (await getOrder(order.id)) || order;
    }
    if (session.status === 'expired' && order.paymentStatus !== 'failed') {
      return (await markPaymentStatus(order.id, 'failed', { cancel: true })) || order;
    }
  } catch (err) {
    console.error('[payments] stripe sync failed for', order.id, err?.message || err);
  }
  return order;
}

// Reconciles recent orders still waiting for payment (admin list load).
export async function syncRecentUnpaid({ days = 7, limit = 15 } = {}) {
  if (!stripeConfigured()) return 0;
  const { rows } = await sql`
    SELECT id FROM orders
    WHERE payment_status IN ('unpaid', 'processing') AND stripe_session_id IS NOT NULL
      AND status <> 'cancelled' AND created_at > now() - make_interval(days => ${days})
    ORDER BY created_at DESC LIMIT ${limit}`;
  let changed = 0;
  for (const { id } of rows) {
    const before = await getOrder(id);
    const after = await syncPaymentFromStripe(before);
    if (after && after.paymentStatus !== before.paymentStatus) changed++;
  }
  return changed;
}
