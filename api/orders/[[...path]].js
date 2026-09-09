import {
  ensureOrdersSchema, listOrders, orderStats, getOrder, updateOrderAdmin,
  setInpostShipment, updateInpostStatus,
} from '../_lib/orders.js';
import { isAdmin, readJsonBody } from '../_lib/auth.js';
import { dbErrorMessage } from '../_lib/db.js';
import { ORDER_STATUSES, ADMIN_SETTABLE_STATUSES, inpostServiceFor } from '../_lib/commerce.js';
import { createShipment, getShipment, getLabel, inpostConfigured, inpostErrorMessage } from '../_lib/inpost.js';

// Consolidated, admin-only orders API. All order routes live in this single
// function to stay within the serverless-function limit. Routes:
//   GET   /api/orders                -> list (?status=&limit=&offset=&stats=1)
//   GET   /api/orders/:id            -> detail
//   PATCH /api/orders/:id            -> update status / tracking / notes
//   POST  /api/orders/:id/shipment   -> create InPost shipment
//   GET   /api/orders/:id/shipment   -> refresh InPost shipment status
//   GET   /api/orders/:id/label      -> InPost label PDF (?type=A6|normal)
export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });

  const raw = req.query?.path;
  const seg = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  try {
    await ensureOrdersSchema();

    if (seg.length === 0) return await listHandler(req, res);

    const id = String(seg[0] ?? '').trim();
    if (!id) return res.status(400).json({ error: 'Brak ID zamówienia.' });

    if (seg.length === 1) return await itemHandler(req, res, id);
    if (seg.length === 2 && seg[1] === 'shipment') return await shipmentHandler(req, res, id);
    if (seg.length === 2 && seg[1] === 'label') return await labelHandler(req, res, id);

    return res.status(404).json({ error: 'Nie znaleziono zasobu.' });
  } catch (err) {
    console.error('[api/orders]', err);
    if (err.code === 'SHIPX_ERROR') return res.status(err.status === 404 ? 409 : 502).json({ error: inpostErrorMessage(err) });
    if (err.code === 'NO_INPOST_CONFIG') return res.status(503).json({ error: inpostErrorMessage(err) });
    return res.status(500).json({ error: dbErrorMessage(err) });
  }
}

async function listHandler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Metoda niedozwolona.' }); }
  const status = req.query?.status && ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const limit = req.query?.limit ? Number(req.query.limit) : 25;
  const offset = req.query?.offset ? Number(req.query.offset) : 0;
  const result = await listOrders({ status, limit, offset });
  if (req.query?.stats) result.stats = await orderStats();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}

async function itemHandler(req, res, id) {
  if (req.method === 'GET') {
    const order = await getOrder(id);
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
  if (!inpostConfigured()) {
    return res.status(503).json({ error: 'Integracja InPost nie jest skonfigurowana (INPOST_SHIPX_TOKEN, INPOST_ORG_ID).' });
  }
  const order = await getOrder(id);
  if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });

  if (req.method === 'GET') {
    if (!order.inpostShipmentId) return res.status(404).json({ error: 'To zamówienie nie ma przesyłki InPost.' });
    const s = await getShipment(order.inpostShipmentId);
    const updated = await updateInpostStatus(id, { status: s.status, trackingNumber: s.tracking_number });
    return res.status(200).json(updated);
  }
  if (req.method === 'POST') {
    if (!inpostServiceFor(order.shippingMethod)) {
      return res.status(400).json({ error: 'Ta metoda dostawy nie jest obsługiwana przez InPost (tylko Paczkomat i Kurier InPost).' });
    }
    if (order.paymentStatus !== 'paid') return res.status(400).json({ error: 'Zamówienie nie jest opłacone.' });
    if (order.inpostShipmentId) return res.status(409).json({ error: 'Przesyłka dla tego zamówienia już istnieje.', order });

    const body = await readJsonBody(req);
    const template = ['small', 'medium', 'large'].includes(body?.template) ? body.template : 'small';
    const weightKg = Number(body?.weightKg) > 0 ? Number(body.weightKg) : 1;

    const shipment = await createShipment(order, { template, weightKg });
    const updated = await setInpostShipment(id, {
      shipmentId: String(shipment.id),
      trackingNumber: shipment.tracking_number || null,
      status: shipment.status || 'created',
    });
    return res.status(201).json(updated);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Metoda niedozwolona.' });
}

async function labelHandler(req, res, id) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Metoda niedozwolona.' }); }
  if (!inpostConfigured()) return res.status(503).json({ error: 'Integracja InPost nie jest skonfigurowana.' });

  const order = await getOrder(id);
  if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });
  if (!order.inpostShipmentId) return res.status(404).json({ error: 'To zamówienie nie ma przesyłki InPost.' });

  const type = req.query?.type === 'normal' ? 'normal' : 'A6';
  const { buffer, contentType } = await getLabel(order.inpostShipmentId, { format: 'Pdf', type });

  res.setHeader('Content-Type', contentType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="etykieta-${id}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  return res.end(buffer);
}
