// ============================================================
// Commerce configuration — the server-side source of truth for
// money. All amounts are integers in grosze (1 zł = 100 gr).
// The client is never trusted for prices, shipping, or discounts.
// ============================================================

export const CURRENCY = 'pln';

// Payment methods offered on Stripe Checkout. Override via env
// STRIPE_PAYMENT_METHODS="card,blik,p24". Each must also be enabled
// in the Stripe Dashboard for the account.
export function paymentMethodTypes() {
  const raw = (process.env.STRIPE_PAYMENT_METHODS || 'card,blik,p24')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return raw.length ? raw : ['card'];
}

// Shipping methods. `price` is the base cost in grosze; `requiresPoint`
// marks methods that need a parcel-locker point (InPost Paczkomat).
export const SHIPPING_METHODS = {
  inpost_locker:  { label: 'InPost Paczkomat 24/7', price: 1299, requiresPoint: true,  carrier: 'inpost' },
  inpost_courier: { label: 'Kurier InPost',         price: 1599, requiresPoint: false, carrier: 'inpost' },
  courier:        { label: 'Kurier standardowy',    price: 1999, requiresPoint: false, carrier: 'courier' },
};

// Free shipping at/above this order value (grosze). 300 zł.
export const FREE_SHIPPING_THRESHOLD = 30000;

// Discount codes -> percent off. Validated server-side at checkout.
export const COUPONS = { FBT15: 15, START10: 10 };

// Resolved shipping cost for a method given the goods subtotal (grosze).
// Returns null for an unknown method.
export function shippingCostFor(methodKey, subtotalGrosze) {
  const m = SHIPPING_METHODS[methodKey];
  if (!m) return null;
  if (subtotalGrosze >= FREE_SHIPPING_THRESHOLD) return 0;
  return m.price;
}

export function couponPercent(code) {
  if (!code) return 0;
  return COUPONS[String(code).trim().toUpperCase()] || 0;
}

// ---- Order lifecycle -------------------------------------------------

// Fulfillment status (what the shop is doing with the order).
export const ORDER_STATUSES = ['pending', 'paid', 'fulfilled', 'shipped', 'completed', 'cancelled'];
// Payment status (what Stripe reports).
export const PAYMENT_STATUSES = ['unpaid', 'processing', 'paid', 'failed', 'refunded'];

// Admin may move an order into any of these fulfilment states.
export const ADMIN_SETTABLE_STATUSES = ['paid', 'fulfilled', 'shipped', 'completed', 'cancelled'];

// ---- Money helpers ---------------------------------------------------

export const toGrosze = (zl) => Math.round(Number(zl) * 100);
export const formatPLN = (grosze) =>
  (Number(grosze) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

// Absolute base URL for building Stripe success/cancel links. Prefers
// PUBLIC_BASE_URL, else derives from the forwarded request headers.
export function baseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
