import { inpostServiceFor, PARCEL_TEMPLATES } from './commerce.js';

// InPost ShipX API client.
// Docs: https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/
// Sandbox and production have different hosts; select with INPOST_ENV.
const HOSTS = {
  production: 'https://api-shipx-pl.easypack24.net',
  sandbox: 'https://sandbox-api-shipx-pl.easypack24.net',
};

function baseHost() {
  const env = (process.env.INPOST_ENV || 'production').toLowerCase();
  return HOSTS[env] || HOSTS.production;
}

function config() {
  const token = process.env.INPOST_SHIPX_TOKEN;
  const orgId = process.env.INPOST_ORG_ID;
  if (!token || !orgId) {
    const err = new Error('missing_inpost_config');
    err.code = 'NO_INPOST_CONFIG';
    throw err;
  }
  return { token, orgId };
}

export function inpostConfigured() {
  return !!(process.env.INPOST_SHIPX_TOKEN && process.env.INPOST_ORG_ID);
}

// Low-level ShipX request. Returns parsed JSON; throws a rich error on non-2xx.
async function shipx(path, { method = 'GET', body, accept = 'application/json' } = {}) {
  const { token } = config();
  const res = await fetch(baseHost() + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (accept !== 'application/json') {
    if (!res.ok) throw await shipxError(res);
    const buf = Buffer.from(await res.arrayBuffer());
    return { buffer: buf, contentType: res.headers.get('content-type') || accept };
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw shipxErrorFromJson(res.status, data);
  return data;
}

async function shipxError(res) {
  let detail = '';
  try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
  return shipxErrorFromJson(res.status, detail);
}

function shipxErrorFromJson(status, data) {
  const err = new Error(typeof data === 'string' ? data : (data?.message || `ShipX ${status}`));
  err.code = 'SHIPX_ERROR';
  err.status = status;
  err.details = data?.details || data;
  return err;
}

// --- Payload builders -------------------------------------------------

// PL phone: keep digits, take the last 9 (ShipX wants the national number).
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-9);
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] || 'Klient', last: '-' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// Splits "Ulica 12A/3" -> { street:"Ulica", building_number:"12A/3" }.
function splitStreet(street) {
  const s = String(street || '').trim();
  const m = s.match(/^(.*?)[\s,]+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)$/);
  if (m) return { street: m[1].trim(), building_number: m[2] };
  return { street: s || '-', building_number: '1' };
}

function buildReceiver(order, withAddress) {
  const { first, last } = splitName(order.customer?.name);
  const receiver = {
    first_name: first,
    last_name: last,
    email: order.customer?.email || undefined,
    phone: normalizePhone(order.customer?.phone),
  };
  if (withAddress) {
    const a = order.shippingAddress || {};
    const { street, building_number } = splitStreet(a.street);
    receiver.address = {
      street,
      building_number,
      city: a.city || '',
      post_code: a.postcode || '',
      country_code: (a.country || 'PL').toUpperCase(),
    };
  }
  return receiver;
}

// Builds the ShipX shipment payload for an order + chosen parcel options.
export function buildShipmentPayload(order, { template = 'small', weightKg = 1 } = {}) {
  const svc = inpostServiceFor(order.shippingMethod);
  if (!svc) {
    const err = new Error('Ta metoda dostawy nie jest obsługiwana przez InPost.');
    err.code = 'NOT_INPOST';
    throw err;
  }
  const tpl = PARCEL_TEMPLATES[template] ? template : 'small';

  const parcel = svc.locker
    ? { template: tpl }
    : { dimensions: PARCEL_TEMPLATES[tpl].dimensions, weight: { amount: Number(weightKg) || 1, unit: 'kg' } };

  const custom_attributes = svc.locker
    ? { sending_method: svc.sendingMethod, target_point: order.inpostPoint }
    : { sending_method: svc.sendingMethod };

  return {
    receiver: buildReceiver(order, !svc.locker),
    parcels: [parcel],
    custom_attributes,
    service: svc.service,
    reference: order.id,
  };
}

// --- Public operations ------------------------------------------------

export async function createShipment(order, opts = {}) {
  const { orgId } = config();
  const payload = buildShipmentPayload(order, opts);
  return shipx(`/v1/organizations/${orgId}/shipments`, { method: 'POST', body: payload });
}

export async function getShipment(shipmentId) {
  return shipx(`/v1/shipments/${encodeURIComponent(shipmentId)}`);
}

// Returns { buffer, contentType }. format: Pdf|Zpl|Epl, type: A6|normal (A4).
export async function getLabel(shipmentId, { format = 'Pdf', type = 'A6' } = {}) {
  const q = new URLSearchParams({ format, type });
  return shipx(`/v1/shipments/${encodeURIComponent(shipmentId)}/label?${q}`, { accept: 'application/pdf' });
}

export function inpostErrorMessage(err) {
  if (err?.code === 'NO_INPOST_CONFIG') {
    return 'Integracja InPost nie jest skonfigurowana. Ustaw INPOST_SHIPX_TOKEN oraz INPOST_ORG_ID.';
  }
  if (err?.code === 'NOT_INPOST') return err.message;
  if (err?.code === 'SHIPX_ERROR') {
    if (err.status === 404) return 'Etykieta nie jest jeszcze gotowa. Spróbuj za chwilę.';
    return `InPost: ${err.message}`;
  }
  return 'Błąd integracji InPost.';
}
