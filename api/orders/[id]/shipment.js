import { ensureOrdersSchema, getOrder, setInpostShipment, updateInpostStatus } from '../../_lib/orders.js';
import { isAdmin, readJsonBody } from '../../_lib/auth.js';
import { createShipment, getShipment, inpostConfigured, inpostErrorMessage } from '../../_lib/inpost.js';
import { inpostServiceFor } from '../../_lib/commerce.js';

// POST /api/orders/:id/shipment  -> create an InPost shipment (admin)
//   body: { template?: 'small'|'medium'|'large', weightKg?: number }
// GET  /api/orders/:id/shipment  -> refresh shipment status from ShipX (admin)
export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });

  const id = String(req.query?.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Brak ID zamówienia.' });

  try {
    await ensureOrdersSchema();
    if (!inpostConfigured()) {
      return res.status(503).json({ error: 'Integracja InPost nie jest skonfigurowana (INPOST_SHIPX_TOKEN, INPOST_ORG_ID).' });
    }

    const order = await getOrder(id);
    if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });

    // ---- Refresh status of an existing shipment ----
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
      if (order.paymentStatus !== 'paid') {
        return res.status(400).json({ error: 'Zamówienie nie jest opłacone.' });
      }
      if (order.inpostShipmentId) {
        return res.status(409).json({ error: 'Przesyłka dla tego zamówienia już istnieje.', order });
      }

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
  } catch (err) {
    console.error('[api/orders/:id/shipment]', err);
    const status = err.code === 'SHIPX_ERROR' ? 502 : 500;
    return res.status(status).json({ error: inpostErrorMessage(err), details: err.details });
  }
}
