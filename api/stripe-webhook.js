import { ensureOrdersSchema, markPaid, markPaymentStatus, getOrderBySession } from './_lib/orders.js';
import { getStripe } from './_lib/stripe.js';

// Stripe requires the raw, unmodified request body to verify the signature.
// Disable Vercel's automatic body parsing for this route.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

// Resolves the order id a Stripe object refers to.
function orderIdFromSession(session) {
  return session?.metadata?.order_id || session?.client_reference_id || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;
  try {
    const stripe = getStripe();
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    // Bad signature / malformed payload — never trust it.
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    await ensureOrdersSchema();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderId = orderIdFromSession(session);
        if (!orderId) break;
        if (session.payment_status === 'paid') {
          await markPaid(orderId, { paymentIntent: session.payment_intent, total: session.amount_total });
        } else {
          // Async method (e.g. P24) still pending — awaiting async_payment_succeeded.
          await markPaymentStatus(orderId, 'processing');
        }
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const orderId = orderIdFromSession(session);
        if (orderId) await markPaid(orderId, { paymentIntent: session.payment_intent, total: session.amount_total });
        break;
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        const orderId = orderIdFromSession(session);
        if (orderId) await markPaymentStatus(orderId, 'failed', { cancel: true });
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const orderId = orderIdFromSession(session);
        if (orderId) await markPaymentStatus(orderId, 'failed', { cancel: true });
        break;
      }
      case 'charge.refunded': {
        // Best-effort: map the payment intent back to the order via its session.
        const charge = event.data.object;
        if (charge.payment_intent) {
          const stripe = getStripe();
          const sessions = await stripe.checkout.sessions.list({ payment_intent: charge.payment_intent, limit: 1 });
          const session = sessions.data[0];
          if (session) {
            const order = await getOrderBySession(session.id);
            if (order) await markPaymentStatus(order.id, 'refunded');
          }
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    // 500 lets Stripe retry delivery.
    return res.status(500).json({ error: 'Handler error' });
  }
}
