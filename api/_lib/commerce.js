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

// Shipping methods. `requiresPoint` marks methods delivered to a pickup
// point / parcel locker (need a point code); the rest go to an address.
// Ceny w groszach. `tiers` = progi wg liczby par: 1-2 pary (maxQty 2)
// oraz 3+ par (Infinity). `carrier` steruje m.in. mapą InPost w checkoucie.
export const SHIPPING_METHODS = {
  // --- Odbiór w punkcie / paczkomacie ---
  dpd_point:      { label: 'DPD Pickup (punkt)',      requiresPoint: true,  carrier: 'dpd',
                    tiers: [{ maxQty: 2, price: 1300 }, { maxQty: Infinity, price: 1500 }] },
  pocztex_point:  { label: 'Pocztex (punkt/automat)', requiresPoint: true,  carrier: 'pocztex',
                    tiers: [{ maxQty: 2, price: 1400 }, { maxQty: Infinity, price: 1400 }] },
  inpost_locker:  { label: 'InPost Paczkomat 24/7',   requiresPoint: true,  carrier: 'inpost',
                    tiers: [{ maxQty: 2, price: 1700 }, { maxQty: Infinity, price: 2000 }] },
  orlen_point:    { label: 'Orlen Paczka (punkt)',    requiresPoint: true,  carrier: 'orlen',
                    tiers: [{ maxQty: 2, price: 1500 }, { maxQty: Infinity, price: 1600 }] },
  // --- Kurier na adres ---
  dpd_courier:    { label: 'Kurier DPD',              requiresPoint: false, carrier: 'dpd',
                    tiers: [{ maxQty: 2, price: 2400 }, { maxQty: Infinity, price: 2800 }] },
  pocztex_courier:{ label: 'Kurier Pocztex',          requiresPoint: false, carrier: 'pocztex',
                    tiers: [{ maxQty: 2, price: 1500 }, { maxQty: Infinity, price: 1500 }] },
  inpost_courier: { label: 'Kurier InPost',           requiresPoint: false, carrier: 'inpost',
                    tiers: [{ maxQty: 2, price: 1900 }, { maxQty: Infinity, price: 2300 }] },
};

// Free shipping is disabled — shipping is always charged per method.
export const FREE_SHIPPING_THRESHOLD = Infinity;

// Maps our shipping method -> InPost ShipX service. Only these methods can
// have an InPost label generated; `courier` is a generic (non-InPost) carrier.
export const INPOST_SERVICES = {
  inpost_locker:  { service: 'inpost_locker_standard',  sendingMethod: 'parcel_locker',  locker: true },
  inpost_courier: { service: 'inpost_courier_standard', sendingMethod: 'dispatch_order', locker: false },
};
export function inpostServiceFor(method) {
  return INPOST_SERVICES[method] || null;
}

// InPost Paczkomat parcel templates (gabaryty). Dimensions in millimetres.
export const PARCEL_TEMPLATES = {
  small:  { label: 'Gabaryt A', dimensions: { length: 640, width: 380, height: 80,  unit: 'mm' } },
  medium: { label: 'Gabaryt B', dimensions: { length: 640, width: 380, height: 190, unit: 'mm' } },
  large:  { label: 'Gabaryt C', dimensions: { length: 640, width: 380, height: 410, unit: 'mm' } },
};

// Discount codes -> percent off. Validated server-side at checkout.
export const COUPONS = { FBT15: 15, START10: 10 };

// Resolved shipping cost for a method given the goods subtotal (grosze).
// Returns null for an unknown method.
export function shippingCostFor(methodKey, qty = 1) {
  const m = SHIPPING_METHODS[methodKey];
  if (!m) return null;
  if (Array.isArray(m.tiers)) {
    const q = Math.max(1, Math.round(Number(qty) || 1));
    const tier = m.tiers.find((t) => q <= t.maxQty) || m.tiers[m.tiers.length - 1];
    return tier.price;
  }
  return m.price ?? null;
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
