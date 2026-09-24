import crypto from 'node:crypto';
import { sql } from './db.js';

let ordersSchemaReady = false;

export async function ensureOrdersSchema() {
  if (ordersSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id                   TEXT PRIMARY KEY,
      status               TEXT NOT NULL DEFAULT 'pending',
      payment_status       TEXT NOT NULL DEFAULT 'unpaid',
      currency             TEXT NOT NULL DEFAULT 'pln',
      items                JSONB NOT NULL DEFAULT '[]'::jsonb,
      subtotal             INTEGER NOT NULL DEFAULT 0,
      discount             INTEGER NOT NULL DEFAULT 0,
      discount_code        TEXT,
      shipping_method      TEXT,
      shipping_label       TEXT,
      shipping_cost        INTEGER NOT NULL DEFAULT 0,
      total                INTEGER NOT NULL DEFAULT 0,
      customer_email       TEXT,
      customer_name        TEXT,
      customer_phone       TEXT,
      shipping_address     JSONB,
      inpost_point         TEXT,
      tracking_number      TEXT,
      notes                TEXT,
      stripe_session_id    TEXT,
      stripe_payment_intent TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at              TIMESTAMPTZ
    )`;
  await sql`CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`;
  await sql`CREATE INDEX IF NOT EXISTS orders_session_idx ON orders (stripe_session_id)`;
  // InPost ShipX shipment linkage (added after the table first shipped).
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS inpost_shipment_id TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS inpost_status TEXT`;
  // Optional invoice details (nazwa firmy, NIP, adres) — added after launch.
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice JSONB`;
  // Regulamin (terms) acceptance recorded at checkout.
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ`;
  // Carrier-agnostic shipment (Furgonetka): provider, package id, state and a
  // small JSON bag (pending order-command uuid, carrier, price, e-mail flags).
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_provider TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_id TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_meta JSONB`;
  // Human-readable name/address of the pickup point chosen on the map.
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS point_name TEXT`;
  ordersSchemaReady = true;
}

// Human-friendly, hard-to-guess order id, e.g. FBT-20260908-9F3AC2.
export function genOrderId() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `FBT-${ymd}-${rand}`;
}

export function mapOrder(r) {
  return {
    id: r.id,
    status: r.status,
    paymentStatus: r.payment_status,
    currency: r.currency,
    items: r.items || [],
    subtotal: r.subtotal,
    discount: r.discount,
    discountCode: r.discount_code,
    shippingMethod: r.shipping_method,
    shippingLabel: r.shipping_label,
    shippingCost: r.shipping_cost,
    total: r.total,
    customer: { email: r.customer_email, name: r.customer_name, phone: r.customer_phone },
    shippingAddress: r.shipping_address || null,
    invoice: r.invoice || null,
    termsAcceptedAt: r.terms_accepted_at || null,
    inpostPoint: r.inpost_point,
    pointName: r.point_name || null,
    shipment: r.shipment_id
      ? { ...(r.shipment_meta || {}), provider: r.shipment_provider, id: r.shipment_id, status: r.shipment_status }
      : (r.inpost_shipment_id ? { ...(r.shipment_meta || {}), provider: 'inpost', id: r.inpost_shipment_id, status: r.inpost_status } : null),
    inpostShipmentId: r.inpost_shipment_id,
    inpostStatus: r.inpost_status,
    trackingNumber: r.tracking_number,
    notes: r.notes,
    stripeSessionId: r.stripe_session_id,
    stripePaymentIntent: r.stripe_payment_intent,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    paidAt: r.paid_at,
  };
}

export async function createOrder(o) {
  const { rows } = await sql`
    INSERT INTO orders (
      id, status, payment_status, currency, items, subtotal, discount, discount_code,
      shipping_method, shipping_label, shipping_cost, total,
      customer_email, customer_name, customer_phone, shipping_address, inpost_point, point_name, invoice, terms_accepted_at
    ) VALUES (
      ${o.id}, ${o.status || 'pending'}, ${o.paymentStatus || 'unpaid'}, ${o.currency || 'pln'},
      ${JSON.stringify(o.items || [])}::jsonb, ${o.subtotal || 0}, ${o.discount || 0}, ${o.discountCode || null},
      ${o.shippingMethod || null}, ${o.shippingLabel || null}, ${o.shippingCost || 0}, ${o.total || 0},
      ${o.customer?.email || null}, ${o.customer?.name || null}, ${o.customer?.phone || null},
      ${o.shippingAddress ? JSON.stringify(o.shippingAddress) : null}::jsonb, ${o.inpostPoint || null}, ${o.pointName || null},
      ${o.invoice ? JSON.stringify(o.invoice) : null}::jsonb, ${o.termsAccepted ? new Date().toISOString() : null}
    ) RETURNING *`;
  return mapOrder(rows[0]);
}

export async function getOrder(id) {
  const { rows } = await sql`SELECT * FROM orders WHERE id = ${id}`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function getOrderBySession(sessionId) {
  const { rows } = await sql`SELECT * FROM orders WHERE stripe_session_id = ${sessionId} LIMIT 1`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Attaches the Stripe session id + authoritative totals from the session.
export async function attachSession(id, { sessionId, subtotal, discount, shippingCost, total }) {
  const { rows } = await sql`
    UPDATE orders SET
      stripe_session_id = ${sessionId},
      subtotal = COALESCE(${subtotal}, subtotal),
      discount = COALESCE(${discount}, discount),
      shipping_cost = COALESCE(${shippingCost}, shipping_cost),
      total = COALESCE(${total}, total),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Idempotently records a successful payment. Only transitions an order that
// has not already been marked paid, so repeated webhook deliveries are safe.
export async function markPaid(id, { paymentIntent, total } = {}) {
  const { rows } = await sql`
    UPDATE orders SET
      payment_status = 'paid',
      status = CASE WHEN status = 'pending' THEN 'paid' ELSE status END,
      stripe_payment_intent = COALESCE(${paymentIntent || null}, stripe_payment_intent),
      total = COALESCE(${total ?? null}, total),
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
    WHERE id = ${id} AND payment_status <> 'paid'
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function markPaymentStatus(id, paymentStatus, { cancel = false } = {}) {
  const { rows } = await sql`
    UPDATE orders SET
      payment_status = ${paymentStatus},
      status = CASE WHEN ${cancel} AND status = 'pending' THEN 'cancelled' ELSE status END,
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Records the created InPost shipment (id, tracking, status) on the order.
export async function setInpostShipment(id, { shipmentId, trackingNumber, status }) {
  const { rows } = await sql`
    UPDATE orders SET
      inpost_shipment_id = ${shipmentId},
      inpost_status = ${status || null},
      tracking_number = COALESCE(${trackingNumber || null}, tracking_number),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Refreshes just the InPost shipment status / tracking after polling ShipX.
export async function updateInpostStatus(id, { status, trackingNumber }) {
  const { rows } = await sql`
    UPDATE orders SET
      inpost_status = COALESCE(${status || null}, inpost_status),
      tracking_number = COALESCE(${trackingNumber || null}, tracking_number),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Records / updates the Furgonetka shipment. `meta` is merged into the JSON
// bag; tracking only overwrites when a new number is known. Moving an order
// that is still "paid" to "fulfilled" once a label exists keeps the list tidy.
export async function setShipment(id, { provider = 'furgonetka', shipmentId, status, trackingNumber, meta = {}, markFulfilled = false }) {
  const { rows } = await sql`
    UPDATE orders SET
      shipment_provider = ${provider},
      shipment_id = COALESCE(${shipmentId || null}, shipment_id),
      shipment_status = COALESCE(${status || null}, shipment_status),
      shipment_meta = COALESCE(shipment_meta, '{}'::jsonb) || ${JSON.stringify(meta)}::jsonb,
      tracking_number = COALESCE(${trackingNumber || null}, tracking_number),
      status = CASE WHEN ${markFulfilled} AND status = 'paid' THEN 'fulfilled' ELSE status END,
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Forgets the shipment (after cancelling / deleting it at the carrier).
export async function clearShipment(id) {
  const { rows } = await sql`
    UPDATE orders SET
      shipment_provider = NULL, shipment_id = NULL, shipment_status = NULL, shipment_meta = NULL,
      inpost_shipment_id = NULL, inpost_status = NULL, tracking_number = NULL,
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function getOrdersByIds(ids) {
  if (!ids.length) return [];
  const { rows } = await sql`SELECT * FROM orders WHERE id = ANY(${ids})`;
  return rows.map(mapOrder);
}

// Public lookup for the tracking page: order id + matching e-mail.
export async function getOrderForCustomer(id, email) {
  const { rows } = await sql`SELECT * FROM orders WHERE id = ${id} AND lower(customer_email) = lower(${email}) LIMIT 1`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Admin edit: fulfilment status, tracking number, notes.
export async function updateOrderAdmin(id, fields) {
  const { rows } = await sql`
    UPDATE orders SET
      status = COALESCE(${fields.status ?? null}, status),
      tracking_number = COALESCE(${fields.trackingNumber ?? null}, tracking_number),
      notes = COALESCE(${fields.notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *`;
  return rows[0] ? mapOrder(rows[0]) : null;
}

// Paginated admin listing with optional status filter.
export async function listOrders({ status = null, limit = 25, offset = 0 } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 25));
  const off = Math.max(0, Number(offset) || 0);
  const rowsRes = status
    ? await sql`SELECT * FROM orders WHERE status = ${status} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`
    : await sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
  const countRes = status
    ? await sql`SELECT COUNT(*)::int AS n FROM orders WHERE status = ${status}`
    : await sql`SELECT COUNT(*)::int AS n FROM orders`;
  return { orders: rowsRes.rows.map(mapOrder), total: countRes.rows[0].n, limit: lim, offset: off };
}

// Small aggregate for the admin dashboard header.
export async function orderStats() {
  const { rows } = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid,
      COUNT(*) FILTER (WHERE status = 'paid')::int AS to_fulfil,
      COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS revenue
    FROM orders`;
  const r = rows[0];
  return { total: r.total, paid: r.paid, toFulfil: r.to_fulfil, revenue: Number(r.revenue) };
}
