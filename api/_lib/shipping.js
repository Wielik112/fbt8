import { FURGONETKA_SERVICES, inpostServiceFor } from './commerce.js';
import { setShipment, setInpostShipment, updateInpostStatus, clearShipment } from './orders.js';
import * as fgApi from './furgonetka.js';
import * as inpostApi from './inpost.js';
import { sendOrderShippedEmail } from './mailer.js';

// Carrier-agnostic shipping layer used by the admin API and the payment
// webhook. Furgonetka handles every method (InPost, DPD, Pocztex, Orlen);
// the older direct InPost ShipX integration stays as a fallback for InPost
// methods when Furgonetka isn't configured, and for orders created with it.

export function providerFor(order) {
  if (order?.shipment?.provider) return order.shipment.provider;
  if (fgApi.furgonetkaConfigured() && FURGONETKA_SERVICES[order?.shippingMethod]) return 'furgonetka';
  if (inpostApi.inpostConfigured() && inpostServiceFor(order?.shippingMethod)) return 'inpost';
  return null;
}

// Whether a new shipment could be created for this order right now.
export function canShip(order) {
  if (fgApi.furgonetkaConfigured() && FURGONETKA_SERVICES[order?.shippingMethod]) return 'furgonetka';
  if (inpostApi.inpostConfigured() && inpostServiceFor(order?.shippingMethod)) return 'inpost';
  return null;
}

function shipError(message, status = 400) {
  const err = new Error(message);
  err.code = 'SHIPPING_INPUT';
  err.status = status;
  return err;
}

// Sends the "your parcel has a tracking number" e-mail once per order.
async function maybeNotify(order, notify) {
  if (!notify || !order?.trackingNumber || order.shipment?.shippedEmailAt) return order;
  try {
    const r = await sendOrderShippedEmail(order);
    if (r?.id) {
      return (await setShipment(order.id, {
        provider: order.shipment?.provider || 'furgonetka',
        meta: { shippedEmailAt: new Date().toISOString() },
      })) || order;
    }
  } catch (err) {
    console.error('[shipping] shipped e-mail failed for', order.id, err?.message || err);
  }
  return order;
}

// Re-reads the Furgonetka package and stores state / tracking on the order.
async function syncFurgonetka(order, extraMeta = {}) {
  const pkg = fgApi.summarizePackage(await fgApi.getPackage(order.shipment.id));
  const ordered = !!(order.shipment?.ordered || extraMeta.ordered);
  return setShipment(order.id, {
    provider: 'furgonetka',
    status: pkg.state || (ordered ? 'ordered' : 'waiting'),
    trackingNumber: pkg.trackingNumber,
    meta: {
      carrier: pkg.carrier || order.shipment?.carrier || null,
      price: pkg.price ?? order.shipment?.price ?? null,
      editUrl: pkg.editUrl || order.shipment?.editUrl || null,
      ...extraMeta,
    },
    markFulfilled: ordered,
  });
}

// Creates (and by default orders) the shipment for a paid order.
// opts: { template, weightKg, order = true, notify = true, budgetMs }
export async function createShipmentForOrder(order, opts = {}) {
  const { template = 'small', weightKg = 1, order: doOrder = true, notify = true, budgetMs = 8000 } = opts;
  if (order.paymentStatus !== 'paid') throw shipError('Zamówienie nie jest opłacone.');
  const provider = order.shipment?.provider || canShip(order);
  if (!provider) {
    throw shipError('Brak skonfigurowanej integracji wysyłkowej dla tej metody dostawy (ustaw zmienne FURGONETKA_*).', 503);
  }

  if (provider === 'inpost') {
    if (order.shipment?.id) throw shipError('Przesyłka dla tego zamówienia już istnieje.', 409);
    const s = await inpostApi.createShipment(order, { template, weightKg });
    const updated = await setInpostShipment(order.id, {
      shipmentId: String(s.id), trackingNumber: s.tracking_number || null, status: s.status || 'created',
    });
    return maybeNotify(updated, notify);
  }

  // --- Furgonetka ---
  let current = order;
  if (current.shipment?.ordered) throw shipError('Przesyłka dla tego zamówienia jest już zamówiona.', 409);

  if (!current.shipment?.id) {
    const created = fgApi.summarizePackage(await fgApi.createPackage(current, { template, weightKg }));
    if (!created.packageId) throw shipError('Furgonetka nie zwróciła numeru paczki.', 502);
    current = await setShipment(current.id, {
      provider: 'furgonetka',
      shipmentId: created.packageId,
      status: created.state || 'waiting',
      trackingNumber: created.trackingNumber,
      meta: { carrier: created.carrier, price: created.price, editUrl: created.editUrl, template, weightKg: Number(weightKg) || 1 },
    });
  }
  if (!doOrder) return current;

  const { uuid, result } = await fgApi.orderPackages([current.shipment.id], { budgetMs });
  if (result === 'pending') {
    return setShipment(current.id, { provider: 'furgonetka', status: 'ordering', meta: { orderCommand: uuid } });
  }
  current = await syncFurgonetka(current, { ordered: true, orderCommand: null, orderedAt: new Date().toISOString() });
  return maybeNotify(current, notify);
}

// Refreshes shipment state from the carrier (and finishes a pending order).
export async function refreshShipmentForOrder(order, { notify = true } = {}) {
  const sh = order.shipment;
  if (!sh?.id) throw shipError('To zamówienie nie ma przesyłki.', 404);

  if (sh.provider === 'inpost') {
    const s = await inpostApi.getShipment(sh.id);
    const updated = await updateInpostStatus(order.id, { status: s.status, trackingNumber: s.tracking_number });
    return maybeNotify(updated, notify);
  }

  const extra = {};
  if (sh.orderCommand) {
    const r = await fgApi.orderCommandStatus(sh.orderCommand);
    if (r === 'done') Object.assign(extra, { ordered: true, orderCommand: null, orderedAt: new Date().toISOString() });
  }
  if (sh.ordered || extra.ordered) {
    try {
      const events = await fgApi.getTracking(sh.id);
      if (events.length) extra.events = events.slice(0, 30);
    } catch { /* tracking appears only once the carrier scans the parcel */ }
  }
  let updated = await syncFurgonetka(order, extra);
  if (!updated.shipment?.ordered && updated.shipment?.orderCommand) {
    updated = await setShipment(order.id, { provider: 'furgonetka', status: 'ordering' });
  }
  return maybeNotify(updated, notify);
}

// Label PDF. format: 'a6' (label printer) | 'a4'.
export async function labelForOrder(order, { format = 'a6' } = {}) {
  const sh = order.shipment;
  if (!sh?.id) throw shipError('To zamówienie nie ma przesyłki.', 404);
  if (sh.provider === 'inpost') {
    return inpostApi.getLabel(sh.id, { format: 'Pdf', type: format === 'a4' ? 'normal' : 'A6' });
  }
  if (!sh.ordered) throw shipError('Najpierw zamów przesyłkę — etykieta powstaje po zamówieniu.', 409);
  return fgApi.getLabel(sh.id, { format });
}

// One PDF with labels for several orders (Furgonetka only).
export async function bulkLabels(orders, { format = 'a6' } = {}) {
  const ids = orders
    .filter((o) => o.shipment?.provider === 'furgonetka' && o.shipment?.ordered)
    .map((o) => o.shipment.id);
  if (!ids.length) throw shipError('Żadne z zaznaczonych zamówień nie ma zamówionej przesyłki Furgonetka.', 404);
  return fgApi.getDocuments(ids, { format });
}

// Cancels / deletes the shipment and detaches it from the order.
export async function cancelShipmentForOrder(order) {
  const sh = order.shipment;
  if (!sh?.id) throw shipError('To zamówienie nie ma przesyłki.', 404);
  if (sh.provider !== 'furgonetka') throw shipError('Anulowanie z panelu działa tylko dla przesyłek Furgonetka.');
  if (sh.ordered || sh.orderCommand) {
    const { result } = await fgApi.cancelPackages([sh.id]);
    if (result !== 'done') throw shipError('Anulowanie jest w toku po stronie przewoźnika. Odśwież za chwilę.', 202);
  } else {
    await fgApi.deletePackage(sh.id);
  }
  return clearShipment(order.id);
}

// Maps any shipping error to { status, error } for the HTTP layer.
export function shippingErrorResponse(err) {
  if (err?.code === 'SHIPPING_INPUT') return { status: err.status || 400, error: err.message };
  if (err?.code === 'NO_FURGONETKA_CONFIG') return { status: 503, error: fgApi.furgonetkaErrorMessage(err) };
  if (['FURGONETKA_AUTH', 'FURGONETKA_2FA'].includes(err?.code)) return { status: 502, error: fgApi.furgonetkaErrorMessage(err) };
  if (err?.code === 'FURGONETKA_NO_SERVICE') return { status: 400, error: fgApi.furgonetkaErrorMessage(err) };
  if (err?.code === 'FURGONETKA_ERROR') {
    const s = err.status;
    return { status: s === 404 ? 409 : (s >= 400 && s < 500 ? 400 : 502), error: fgApi.furgonetkaErrorMessage(err) };
  }
  if (err?.code === 'SHIPX_ERROR') return { status: err.status === 404 ? 409 : 502, error: inpostApi.inpostErrorMessage(err) };
  if (err?.code === 'NO_INPOST_CONFIG' || err?.code === 'NOT_INPOST') return { status: 503, error: inpostApi.inpostErrorMessage(err) };
  return null;
}
