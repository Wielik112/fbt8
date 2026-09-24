import { setShipment } from './orders.js';
import { decrementStock } from './db.js';
import { canShip, createShipmentForOrder } from './shipping.js';
import { furgonetkaAutoOrder } from './furgonetka.js';
import { sendOrderPreparingEmail } from './mailer.js';

// Runs once, right after an order first transitions to "paid".
// Best-effort: failures here are logged but never bubble up to the webhook,
// so a mailer / carrier outage can never break payment confirmation.
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

  // 1) Auto-create the shipment (Furgonetka for every carrier, or InPost
  //    ShipX as fallback). With Furgonetka the label is ordered right away
  //    unless FURGONETKA_AUTO_ORDER=0 — then only a draft is created and the
  //    label is ordered with one click in the panel. Short polling budget so
  //    the Stripe webhook answers quickly; the panel finishes anything pending.
  const provider = canShip(order);
  if (provider && !order.shipment?.id) {
    try {
      const doOrder = provider === 'inpost' || furgonetkaAutoOrder();
      current = await createShipmentForOrder(order, { template: 'small', weightKg: 1, order: doOrder, notify: false, budgetMs: 4000 });
    } catch (err) {
      console.error('[fulfil] auto-shipment failed for', order.id, err?.message || err);
    }
  }

  // 2) Notify the customer that the parcel is being prepared.
  try {
    const sent = await sendOrderPreparingEmail(current);
    // The tracking number went out in this e-mail — don't send a second one.
    if (sent?.id && current.trackingNumber && current.shipment?.id) {
      current = (await setShipment(current.id, {
        provider: current.shipment.provider, meta: { shippedEmailAt: new Date().toISOString() },
      })) || current;
    }
  } catch (err) {
    console.error('[fulfil] preparing e-mail failed for', order.id, err?.message || err);
  }

  return current;
}
