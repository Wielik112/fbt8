import { ensureOrdersSchema, getOrder } from '../../_lib/orders.js';
import { isAdmin } from '../../_lib/auth.js';
import { getLabel, inpostConfigured, inpostErrorMessage } from '../../_lib/inpost.js';

// GET /api/orders/:id/label?format=Pdf&type=A6   (admin)
// Streams the InPost shipping label PDF for printing. type: A6 | normal (A4).
export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Brak autoryzacji.' });

  const id = String(req.query?.id ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Brak ID zamówienia.' });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  try {
    await ensureOrdersSchema();
    if (!inpostConfigured()) {
      return res.status(503).json({ error: 'Integracja InPost nie jest skonfigurowana.' });
    }

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
  } catch (err) {
    console.error('[api/orders/:id/label]', err);
    const status = err.code === 'SHIPX_ERROR' ? (err.status === 404 ? 409 : 502) : 500;
    return res.status(status).json({ error: inpostErrorMessage(err) });
  }
}
