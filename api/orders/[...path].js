import {
  ensureOrdersSchema, listOrders, orderStats, getOrder, getOrdersByIds, updateOrderAdmin,
} from '../_lib/orders.js';
import { isAdmin, readJsonBody } from '../_lib/auth.js';
import { dbErrorMessage } from '../_lib/db.js';
import { ORDER_STATUSES, ADMIN_SETTABLE_STATUSES, SHIPPING_METHODS } from '../_lib/commerce.js';
import {
  canShip, createShipmentForOrder, refreshShipmentForOrder, labelForOrder, bulkLabels,
  cancelShipmentForOrder, shippingErrorResponse,
} from '../_lib/shipping.js';
import {
  furgonetkaConfigured, furgonetkaAutoOrder, listAccountServices, serviceMapping,
  senderAddress, senderMissingFields, accountBalance, furgonetkaErrorMessage,
} from '../_lib/furgonetka.js';
import { inpostConfigured } from '../_lib/inpost.js';
import { syncPaymentFromStripe, syncRecentUnpaid } from '../_lib/payments.js';

// Consolidated, admin-only orders API. All order routes live in this single
// function to stay within the serverless-function limit. Routes:
//   GET    /api/orders(/list)           -> list (?status=&limit=&offset=&stats=1)
//   GET    /api/orders/shipping-config  -> Furgonetka / InPost setup check
//   POST   /api/orders/labels           -> one PDF with many labels {ids, format}
//   GET    /api/orders/:id              -> detail
//   PATCH  /api/orders/:id              -> update status / tracking / notes
//   POST   /api/orders/:id/shipment     -> create (+ order) shipment {template, weightKg, order}
//   GET    /api/orders/:id/shipment     -> refresh shipment status / tracking
//   DELETE /api/orders/:id/shipment     -> cancel / delete shipment
//   GET    /api/orders/:id/label        -> label PDF (?format=a6|a4)
export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });

  // Route segments after /api/orders. Read from the URL itself: on plain
  // Vercel functions the catch-all param doesn't always reach req.query.
  // "/api/orders" is rewritten to "/api/orders/list" (vercel.json).
  let seg = routeSegments(req);
  if (seg.length === 1 && seg[0] === 'list') seg = [];

  try {
    await ensureOrdersSchema();

    if (seg.length === 0) return await listHandler(req, res);
    if (seg.length === 1 && seg[0] === 'shipping-config') return await configHandler(req, res);
    if (seg.length === 1 && seg[0] === 'labels') return await bulkLabelHandler(req, res);

    const id = String(seg[0] ?? '').trim();
    if (!id) return res.status(400).json({ error: 'Brak ID zamówienia.' });

    if (seg.length === 1) return await itemHandler(req, res, id);
    if (seg.length === 2 && seg[1] === 'shipment') return await shipmentHandler(req, res, id);
    if (seg.length === 2 && seg[1] === 'label') return await labelHandler(req, res, id);

    return res.status(404).json({ error: 'Nie znaleziono zasobu.' });
  } catch (err) {
    console.error('[api/orders]', err);
    const mapped = shippingErrorResponse(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}

function routeSegments(req) {
  let pathname = '';
  try { pathname = new URL(req.url || '', 'http://x').pathname; } catch { /* ignore */ }
  const m = pathname.match(/\/api\/orders(?:\/(.*))?$/);
  if (m) return (m[1] || '').split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw ?? '').split('/').filter(Boolean);
}

async function listHandler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Metoda niedozwolona.' }); }
  const status = req.query?.status && ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const limit = req.query?.limit ? Number(req.query.limit) : 25;
  const offset = req.query?.offset ? Number(req.query.offset) : 0;
  // Pick up payments whose Stripe webhook never arrived.
  if (offset === 0) await syncRecentUnpaid();
  const result = await listOrders({ status, limit, offset });
  if (req.query?.stats) result.stats = await orderStats();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}

async function itemHandler(req, res, id) {
  if (req.method === 'GET') {
    const order = await syncPaymentFromStripe(await getOrder(id));
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
    if (body.trackingNumber !== undefined) fields.trackingNumber = String(body.trackingNumber).trim() || null;
    if (body.notes !== undefined) fields.notes = String(body.notes).trim().slice(0, 2000) || null;
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Brak zmian do zapisania.' });
    const updated = await updateOrderAdmin(id, fields);
    if (!updated) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });
    return res.status(200).json(updated);
  }
  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Metoda niedozwolona.' });
}

async function shipmentHandler(req, res, id) {
  const order = await syncPaymentFromStripe(await getOrder(id));
  if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });

  if (req.method === 'GET') return res.status(200).json(await refreshShipmentForOrder(order));
  if (req.method === 'DELETE') return res.status(200).json(await cancelShipmentForOrder(order));
  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const template = ['small', 'medium', 'large'].includes(body?.template) ? body.template : 'small';
    const weightKg = Number(body?.weightKg) > 0 ? Math.min(Number(body.weightKg), 50) : 1;
    const updated = await createShipmentForOrder(order, { template, weightKg, order: body?.order !== false });
    return res.status(201).json(updated);
  }
  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Metoda niedozwolona.' });
}

function sendPdf(res, { buffer, contentType }, filename) {
  res.setHeader('Content-Type', contentType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  return res.end(buffer);
}

// Accepts ?format=a6|a4 (and the legacy ?type=A6|normal).
function labelFormat(q) {
  const f = String(q?.format || q?.type || '').toLowerCase();
  return f === 'a4' || f === 'normal' ? 'a4' : 'a6';
}

async function labelHandler(req, res, id) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Metoda niedozwolona.' }); }
  const order = await getOrder(id);
  if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });
  const pdf = await labelForOrder(order, { format: labelFormat(req.query) });
  return sendPdf(res, pdf, `etykieta-${id}.pdf`);
}

async function bulkLabelHandler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Metoda niedozwolona.' }); }
  const body = await readJsonBody(req);
  const ids = (Array.isArray(body?.ids) ? body.ids : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) return res.status(400).json({ error: 'Zaznacz zamówienia do wydruku.' });
  let orders = await getOrdersByIds(ids);
  if (!orders.length) return res.status(404).json({ error: 'Nie znaleziono zaznaczonych zamówień.' });

  // Orders without a label yet: confirm payment with Stripe, then create +
  // order the shipment so one click prints everything that is ready.
  const skipped = [];
  const ready = [];
  for (let o of orders) {
    const sh = o.shipment;
    const hasLabel = sh && (sh.provider === 'inpost' || sh.ordered);
    if (!hasLabel && body?.createMissing !== false) {
      o = await syncPaymentFromStripe(o);
      if (o.paymentStatus !== 'paid') { skipped.push(`${o.id}: nieopłacone`); continue; }
      if (!canShip(o) && !o.shipment) { skipped.push(`${o.id}: brak integracji dla „${o.shippingLabel || o.shippingMethod}”`); continue; }
      try {
        o = await createShipmentForOrder(o, { order: true });
      } catch (err) {
        const mapped = shippingErrorResponse(err);
        skipped.push(`${o.id}: ${mapped ? mapped.error : err.message}`);
        continue;
      }
      if (!o.shipment?.ordered) { skipped.push(`${o.id}: przesyłka w trakcie zamawiania, spróbuj za chwilę`); continue; }
    }
    ready.push(o);
  }
  if (!ready.some((o) => o.shipment?.provider === 'furgonetka' && o.shipment?.ordered)) {
    return res.status(409).json({ error: 'Nie udało się przygotować etykiet. ' + skipped.join('; ') });
  }
  if (skipped.length) res.setHeader('X-Skipped', encodeURIComponent(skipped.join('; ')));
  orders = ready;
  const pdf = await bulkLabels(orders, { format: labelFormat(body) });
  return sendPdf(res, pdf, `etykiety-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Setup check for the panel: which integration is active, what's missing,
// and which Furgonetka service each shipping method resolves to. Never
// returns secrets — only names and booleans.
async function configHandler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Metoda niedozwolona.' }); }
  const out = {
    furgonetka: {
      configured: furgonetkaConfigured(),
      env: (process.env.FURGONETKA_ENV || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
      autoOrder: furgonetkaAutoOrder(),
      missing: ['FURGONETKA_CLIENT_ID', 'FURGONETKA_CLIENT_SECRET', 'FURGONETKA_USERNAME', 'FURGONETKA_PASSWORD']
        .filter((k) => !process.env[k])
        .concat(senderMissingFields().map((k) => 'FURGONETKA_SENDER_' + k.toUpperCase())),
      sender: senderAddress(),
    },
    inpostShipx: { configured: inpostConfigured() },
    stripe: { secretKey: !!process.env.STRIPE_SECRET_KEY, webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET },
    methods: Object.fromEntries(Object.entries(SHIPPING_METHODS).map(([k, m]) => [k, { label: m.label, provider: canShip({ shippingMethod: k }) }])),
  };
  if (out.furgonetka.configured) {
    try {
      out.furgonetka.services = await listAccountServices();
      out.furgonetka.mapping = await serviceMapping();
      out.furgonetka.balance = await accountBalance();
      out.furgonetka.ok = true;
    } catch (err) {
      out.furgonetka.ok = false;
      out.furgonetka.error = furgonetkaErrorMessage(err);
    }
  }
  return res.status(200).json(out);
}
