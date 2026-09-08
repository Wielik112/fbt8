import { ensureSchema, getProduct } from './_lib/db.js';
import { ensureOrdersSchema, createOrder, attachSession, genOrderId } from './_lib/orders.js';
import { getStripe, stripeErrorMessage } from './_lib/stripe.js';
import { readJsonBody } from './_lib/auth.js';
import {
  CURRENCY, SHIPPING_METHODS, shippingCostFor, couponPercent,
  paymentMethodTypes, toGrosze, baseUrl,
} from './_lib/commerce.js';

const MAX_QTY = 99;

// POST /api/checkout
// Body: { items:[{id, qty, size?}], customer:{email,name,phone}, shipping:{method, point?, address?}, coupon? }
// Re-prices from the DB, creates a pending order, and returns a Stripe Checkout URL.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  try {
    await ensureSchema();
    await ensureOrdersSchema();
    const body = await readJsonBody(req);

    // --- Customer ---
    const email = String(body?.customer?.email ?? '').trim();
    const name = String(body?.customer?.name ?? '').trim();
    const phone = String(body?.customer?.phone ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Podaj prawidłowy adres e-mail.' });
    if (!name) return res.status(400).json({ error: 'Podaj imię i nazwisko.' });

    // --- Items (re-priced from DB) ---
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    if (!rawItems.length) return res.status(400).json({ error: 'Koszyk jest pusty.' });

    const items = [];
    const unavailable = [];
    let subtotal = 0;
    for (const raw of rawItems) {
      const id = String(raw?.id ?? '').trim();
      let qty = Math.round(Number(raw?.qty));
      if (!id) continue;
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      if (qty > MAX_QTY) qty = MAX_QTY;
      const product = await getProduct(id);
      if (!product) { unavailable.push(id); continue; }
      const size = raw?.size ? String(raw.size).trim().slice(0, 20) : null;
      const unit = toGrosze(product.price); // authoritative price
      subtotal += unit * qty;
      items.push({ id: product.id, name: product.name, price: unit, qty, size, gradient: product.gradient });
    }
    if (unavailable.length) {
      return res.status(409).json({ error: 'Niektóre produkty są niedostępne i zostały usunięte z oferty.', unavailable });
    }
    if (!items.length) return res.status(400).json({ error: 'Koszyk jest pusty.' });

    // --- Shipping ---
    const methodKey = String(body?.shipping?.method ?? '').trim();
    const method = SHIPPING_METHODS[methodKey];
    if (!method) return res.status(400).json({ error: 'Wybierz metodę dostawy.' });

    let inpostPoint = null;
    let shippingAddress = null;
    if (method.requiresPoint) {
      inpostPoint = String(body?.shipping?.point ?? '').trim();
      if (!inpostPoint) return res.status(400).json({ error: 'Wybierz paczkomat InPost.' });
    } else {
      const a = body?.shipping?.address || {};
      shippingAddress = {
        street: String(a.street ?? '').trim(),
        city: String(a.city ?? '').trim(),
        postcode: String(a.postcode ?? '').trim(),
        country: String(a.country ?? 'PL').trim() || 'PL',
      };
      if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.postcode) {
        return res.status(400).json({ error: 'Uzupełnij adres dostawy (ulica, miasto, kod pocztowy).' });
      }
    }
    const shippingCost = shippingCostFor(methodKey, subtotal);

    // --- Coupon (server-validated) ---
    const couponCode = body?.coupon ? String(body.coupon).trim().toUpperCase() : '';
    const percent = couponPercent(couponCode);
    if (couponCode && !percent) return res.status(400).json({ error: 'Nieprawidłowy kod rabatowy.' });

    // --- Persist a pending order before creating the payment ---
    const orderId = genOrderId();
    await createOrder({
      id: orderId,
      status: 'pending',
      paymentStatus: 'unpaid',
      currency: CURRENCY,
      items,
      subtotal,
      discount: 0,
      discountCode: couponCode || null,
      shippingMethod: methodKey,
      shippingLabel: method.label,
      shippingCost,
      total: subtotal + shippingCost,
      customer: { email, name, phone },
      shippingAddress,
      inpostPoint,
    });

    // --- Stripe Checkout session ---
    const stripe = getStripe();
    const line_items = items.map((it) => ({
      quantity: it.qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: it.price,
        product_data: {
          name: it.name,
          description: it.size ? `Rozmiar: ${it.size}` : undefined,
          metadata: { product_id: it.id },
        },
      },
    }));

    const sessionParams = {
      mode: 'payment',
      locale: 'pl',
      payment_method_types: paymentMethodTypes(),
      line_items,
      customer_email: email,
      client_reference_id: orderId,
      metadata: { order_id: orderId },
      payment_intent_data: { metadata: { order_id: orderId } },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: method.label,
          fixed_amount: { amount: shippingCost, currency: CURRENCY },
        },
      }],
      success_url: `${baseUrl(req)}/dziekujemy.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl(req)}/koszyk.html`,
      // Stripe requires expiry to be at least 30 min out; add a buffer.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 31,
    };

    if (percent) {
      // percent_off coupons must NOT carry a currency (that's amount_off only).
      const coupon = await stripe.coupons.create({
        percent_off: percent,
        duration: 'once',
        name: `Kod ${couponCode}`,
      });
      sessionParams.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Store the session id + authoritative totals computed by Stripe.
    await attachSession(orderId, {
      sessionId: session.id,
      subtotal: session.amount_subtotal ?? subtotal,
      discount: session.total_details?.amount_discount ?? 0,
      shippingCost: session.total_details?.amount_shipping ?? shippingCost,
      total: session.amount_total ?? (subtotal + shippingCost),
    });

    return res.status(200).json({ url: session.url, orderId });
  } catch (err) {
    console.error('[api/checkout]', err);
    return res.status(500).json({ error: stripeErrorMessage(err) });
  }
}
