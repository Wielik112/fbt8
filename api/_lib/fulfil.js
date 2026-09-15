import { setInpostShipment } from './orders.js';
import { decrementStock } from './db.js';
import { createShipment, inpostConfigured } from './inpost.js';
import { inpostServiceFor } from './commerce.js';
import { sendOrderPreparingEmail } from './mailer.js';

// Runs once, right after an order first transitions to "paid".
// Best-effort: failures here are logged but never bubble up to the webhook,
// so a mailer / InPost outage can never break payment confirmation.
export async function onOrderPaid(order) {
  if (!order) return order;
  let current = order;

  // 0) Zdejmij ze stanu magazynowego sprzedane rozmiary (best-effort).
  try {
    for (const it of order.items || []) {
      if (it?.size) await decrementStock(it.id, it.size, it.qty || 1);
    }
  } catch (err) {
    console.error('[fulfil] stock decrement failed for', order.id, err?.message || err);
  }

  // 1) Auto-generate the InPost shipment (Paczkomat / Kurier InPost only).
  if (inpostConfigured() && inpostServiceFor(order.shippingMethod) && !order.inpostShipmentId) {
    try {
      const shipment = await createShipment(order, { template: 'small', weightKg: 1 });
      const updated = await setInpostShipment(order.id, {
        shipmentId: String(shipment.id),
        trackingNumber: shipment.tracking_number || null,
        status: shipment.status || 'created',
      });
      if (updated) current = updated;
    } catch (err) {
      console.error('[fulfil] InPost auto-shipment failed for', order.id, err?.message || err);
    }
  }

  // 2) Notify the customer that the parcel is being prepared.
  try {
    await sendOrderPreparingEmail(current);
  } catch (err) {
    console.error('[fulfil] preparing e-mail failed for', order.id, err?.message || err);
  }

  return current;
}
