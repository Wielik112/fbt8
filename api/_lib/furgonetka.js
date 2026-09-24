import crypto from 'node:crypto';
import { sql } from './db.js';
import { FURGONETKA_SERVICES, PARCEL_TEMPLATES, SHIPPING_METHODS } from './commerce.js';

// Furgonetka.pl REST API client — one integration for every carrier the shop
// offers (InPost, DPD, Pocztex, Orlen Paczka). Flow for an order:
//   1. POST /packages                 -> draft package (free, editable)
//   2. PUT  /order-commands/{uuid}    -> order (buy) it; async, polled
//   3. GET  /packages/{id}            -> tracking number + state
//   4. GET  /packages/{id}/label      -> label to print
// Docs: https://furgonetka.pl/api/rest
//
// Auth is OAuth2 "password" grant: the OAuth app's client id/secret (HTTP
// Basic) + the Furgonetka account login. The token pair is cached in Postgres
// so serverless cold starts don't open a new session every time (Furgonetka
// keeps at most 20 sessions per app and drops the oldest beyond that).

const HOSTS = {
  production: 'https://api.furgonetka.pl',
  sandbox: 'https://api.sandbox.furgonetka.pl',
};
const MEDIA_TYPE = 'application/vnd.furgonetka.v1+json';

function envName() {
  return (process.env.FURGONETKA_ENV || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
}
function baseHost() { return HOSTS[envName()]; }

// Env value with pasted junk removed: surrounding whitespace / newlines and
// wrapping quotes ("..." or '...') are common when copying into Vercel.
function envVal(name) {
  return String(process.env[name] ?? '').trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
}

export function furgonetkaConfigured() {
  return !!(envVal('FURGONETKA_CLIENT_ID') && envVal('FURGONETKA_CLIENT_SECRET')
    && envVal('FURGONETKA_USERNAME') && envVal('FURGONETKA_PASSWORD'));
}

function credentials() {
  if (!furgonetkaConfigured()) {
    const err = new Error('missing_furgonetka_config');
    err.code = 'NO_FURGONETKA_CONFIG';
    throw err;
  }
  return {
    clientId: envVal('FURGONETKA_CLIENT_ID'),
    clientSecret: envVal('FURGONETKA_CLIENT_SECRET'),
    username: envVal('FURGONETKA_USERNAME'),
    // Passwords may legitimately end in spaces/quotes: only strip newlines.
    password: String(process.env.FURGONETKA_PASSWORD ?? '').replace(/[\r\n]+$/, ''),
  };
}

// Auto-order (buy the label) right after payment. On by default; set
// FURGONETKA_AUTO_ORDER=0 to only create drafts and order from the panel.
export function furgonetkaAutoOrder() {
  return !['0', 'false', 'no', 'off'].includes(String(process.env.FURGONETKA_AUTO_ORDER ?? '1').toLowerCase());
}

function fgError(message, { status, details, code = 'FURGONETKA_ERROR' } = {}) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.details = details;
  return err;
}

// --- Token storage ----------------------------------------------------

let memToken = null; // { accessToken, refreshToken, expiresAt, env }
let tokenTableReady = false;

async function ensureTokenTable() {
  if (tokenTableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS furgonetka_auth (
      env           TEXT PRIMARY KEY,
      access_token  TEXT NOT NULL,
      refresh_token TEXT,
      expires_at    TIMESTAMPTZ NOT NULL,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  tokenTableReady = true;
}

async function loadStoredToken() {
  const env = envName();
  if (memToken && memToken.env === env) return memToken;
  try {
    await ensureTokenTable();
    const { rows } = await sql`SELECT * FROM furgonetka_auth WHERE env = ${env}`;
    if (rows[0]) {
      memToken = {
        env,
        accessToken: rows[0].access_token,
        refreshToken: rows[0].refresh_token,
        expiresAt: new Date(rows[0].expires_at).getTime(),
      };
    }
  } catch (err) {
    console.error('[furgonetka] token load failed', err?.message || err);
  }
  return memToken;
}

async function storeToken(tok) {
  memToken = tok;
  try {
    await ensureTokenTable();
    await sql`
      INSERT INTO furgonetka_auth (env, access_token, refresh_token, expires_at, updated_at)
      VALUES (${tok.env}, ${tok.accessToken}, ${tok.refreshToken || null}, ${new Date(tok.expiresAt).toISOString()}, now())
      ON CONFLICT (env) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()`;
  } catch (err) {
    console.error('[furgonetka] token store failed', err?.message || err);
  }
}

async function requestToken(params) {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(baseHost() + '/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params).toString(),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok || !data?.access_token) {
    const reason = data?.error_description || data?.message || data?.error || `HTTP ${res.status}`;
    const code = data?.error === '2fa_required' ? 'FURGONETKA_2FA' : 'FURGONETKA_AUTH';
    let hint = '';
    if (data?.error === 'invalid_grant') {
      hint = ` — login lub hasło nie pasują do konta w środowisku „${envName()}” (${baseHost().replace('https://api.', '')}). `
        + 'Sprawdź FURGONETKA_USERNAME / FURGONETKA_PASSWORD oraz FURGONETKA_ENV (konto sandbox to osobne konto niż produkcyjne).';
    } else if (data?.error === 'invalid_client') {
      hint = ' — nieprawidłowy FURGONETKA_CLIENT_ID lub FURGONETKA_CLIENT_SECRET (albo aplikacja z innego środowiska).';
    }
    throw fgError(`Logowanie do Furgonetki nieudane: ${reason}${hint}`, { status: res.status, details: data, code });
  }
  const tok = {
    env: envName(),
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    // Renew a minute early so a request never goes out with a stale token.
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60_000,
  };
  await storeToken(tok);
  return tok;
}

async function accessToken({ force = false } = {}) {
  const stored = await loadStoredToken();
  if (!force && stored && stored.expiresAt > Date.now()) return stored.accessToken;
  const { username, password } = credentials();
  if (stored?.refreshToken) {
    try {
      return (await requestToken({ grant_type: 'refresh_token', refresh_token: stored.refreshToken })).accessToken;
    } catch (err) {
      console.warn('[furgonetka] refresh failed, logging in again:', err.message);
    }
  }
  return (await requestToken({ grant_type: 'password', scope: 'api', username, password })).accessToken;
}

// --- Low-level request ------------------------------------------------

async function fg(path, { method = 'GET', body, raw = false, retried = false } = {}) {
  const token = await accessToken({ force: retried });
  const res = await fetch(baseHost() + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? `${MEDIA_TYPE}, application/pdf;q=0.9, */*;q=0.8` : MEDIA_TYPE,
      ...(body !== undefined ? { 'Content-Type': MEDIA_TYPE } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Token revoked / expired early (e.g. >20 sessions) -> log in once more.
  if (res.status === 401 && !retried) return fg(path, { method, body, raw, retried: true });

  const contentType = res.headers.get('content-type') || '';
  if (raw && res.ok && !contentType.includes('json')) {
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }

  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) throw fgError(errorText(data) || `Furgonetka HTTP ${res.status}`, { status: res.status, details: data });
  return data;
}

// Furgonetka validation errors come as [{ path, message }] (sometimes nested
// under `errors`); flatten them into one readable line.
function errorText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.slice(0, 300);
  const list = Array.isArray(data) ? data : (Array.isArray(data.errors) ? data.errors : null);
  if (list && list.length) {
    return list.map((e) => [e.path || e.field, e.message || e.error].filter(Boolean).join(': ')).join('; ');
  }
  return data.message || data.error_description || data.error || '';
}

// --- Services (carrier accounts) --------------------------------------

let servicesCache = null; // { at, list }

export async function listAccountServices() {
  if (servicesCache && Date.now() - servicesCache.at < 10 * 60_000) return servicesCache.list;
  const data = await fg('/account/services');
  const list = (Array.isArray(data) ? data : (data?.services || [])).map((s) => ({
    id: Number(s.id ?? s.service_id),
    service: String(s.service || s.code || '').toLowerCase(),
    name: s.name || s.display_name || s.service || '',
    type: s.type || s.service_type || null,
  })).filter((s) => Number.isFinite(s.id));
  servicesCache = { at: Date.now(), list };
  return list;
}

// Optional hard mapping, e.g. FURGONETKA_SERVICE_IDS='{"inpost_locker":123,"dpd_courier":456}'.
function serviceIdOverrides() {
  try { return JSON.parse(process.env.FURGONETKA_SERVICE_IDS || '{}') || {}; } catch { return {}; }
}

// Resolves our shipping method -> Furgonetka service_id. Env override first,
// then the first account service whose code matches the method's candidates.
export async function resolveServiceId(method) {
  const override = Number(serviceIdOverrides()[method]);
  if (Number.isFinite(override) && override > 0) return override;
  const cfg = FURGONETKA_SERVICES[method];
  if (!cfg) return null;
  const list = await listAccountServices();
  for (const code of cfg.services) {
    const hit = list.find((s) => s.service === code);
    if (hit) return hit.id;
  }
  return null;
}

export async function serviceMapping() {
  const out = {};
  for (const method of Object.keys(SHIPPING_METHODS)) {
    try { out[method] = await resolveServiceId(method); } catch { out[method] = null; }
  }
  return out;
}

// --- Payload builders -------------------------------------------------

// Polish numbers as 9 national digits (drops +48 / 0048); others kept as digits.
function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^00/, '');
  return d.length === 11 && d.startsWith('48') ? d.slice(2) : d;
}

export function senderAddress() {
  return {
    name: process.env.FURGONETKA_SENDER_NAME || 'FBT Outlet',
    company: process.env.FURGONETKA_SENDER_COMPANY || '',
    street: process.env.FURGONETKA_SENDER_STREET || '',
    postcode: process.env.FURGONETKA_SENDER_POSTCODE || '',
    city: process.env.FURGONETKA_SENDER_CITY || '',
    country_code: 'PL',
    email: process.env.FURGONETKA_SENDER_EMAIL || 'kontakt@fbtoutlet.pl',
    phone: normalizePhone(process.env.FURGONETKA_SENDER_PHONE),
  };
}

export function senderMissingFields() {
  const s = senderAddress();
  return ['street', 'postcode', 'city', 'phone'].filter((k) => !s[k]);
}

function buildReceiver(order) {
  const a = order.shippingAddress || {};
  const receiver = {
    name: order.customer?.name || 'Klient',
    company: '',
    street: a.street || '',
    postcode: a.postcode || '',
    city: a.city || '',
    country_code: (a.country || 'PL').toUpperCase(),
    email: order.customer?.email || '',
    phone: normalizePhone(order.customer?.phone),
  };
  if (order.inpostPoint) receiver.point = order.inpostPoint;
  return receiver;
}

// Parcel in Furgonetka units: centimetres + kilograms, declared value in PLN.
function buildParcel(order, { template = 'small', weightKg = 1 } = {}) {
  const tpl = PARCEL_TEMPLATES[template] || PARCEL_TEMPLATES.small;
  const d = tpl.dimensions;
  const qty = (order.items || []).reduce((s, i) => s + (i.qty || 1), 0) || 1;
  const names = (order.items || []).map((i) => i.name).filter(Boolean).join(', ');
  return {
    width: Math.round(d.width / 10),
    depth: Math.round(d.length / 10),
    height: Math.round(d.height / 10),
    weight: Math.max(0.1, Number(weightKg) || 1),
    value: Math.max(1, Math.round(Number(order.subtotal || order.total || 0) / 100)),
    description: (names || `Obuwie sportowe (${qty} szt.)`).slice(0, 100),
  };
}

export async function buildPackagePayload(order, opts = {}) {
  const serviceId = await resolveServiceId(order.shippingMethod);
  if (!serviceId) {
    throw fgError(
      `Brak usługi przewoźnika w Furgonetce dla metody „${order.shippingLabel || order.shippingMethod}”. `
      + 'Sprawdź, czy przewoźnik jest aktywny na koncie Furgonetki (lub ustaw FURGONETKA_SERVICE_IDS).',
      { code: 'FURGONETKA_NO_SERVICE' },
    );
  }
  const missing = senderMissingFields();
  if (missing.length) {
    throw fgError(`Uzupełnij adres nadawcy w zmiennych środowiskowych: ${missing.map((k) => 'FURGONETKA_SENDER_' + k.toUpperCase()).join(', ')}.`,
      { code: 'NO_FURGONETKA_CONFIG' });
  }
  const sender = senderAddress();
  return {
    pickup: sender,
    sender,
    receiver: buildReceiver(order),
    service_id: serviceId,
    type: 'package',
    parcels: [buildParcel(order, opts)],
    user_reference_number: order.id,
  };
}

// --- Public operations ------------------------------------------------

// Pulls the interesting bits out of a Furgonetka package object.
export function summarizePackage(p) {
  if (!p) return {};
  const parcels = Array.isArray(p.parcels) ? p.parcels : [];
  const trackingNumber = parcels.map((x) => x.package_no).find(Boolean) || p.package_no || null;
  return {
    packageId: p.package_id != null ? String(p.package_id) : (p.id != null ? String(p.id) : null),
    state: p.state || null,
    trackingNumber,
    carrier: p.service || null,
    price: p.pricing?.price_gross ?? p.pricing?.gross ?? null,
    editUrl: p.edit_url || null,
    cancelAvailable: p.cancel_available ?? null,
  };
}

export async function validatePackage(order, opts) {
  return fg('/packages/validate', { method: 'POST', body: await buildPackagePayload(order, opts) });
}

export async function createPackage(order, opts) {
  const payload = await buildPackagePayload(order, opts);
  await fg('/packages/validate', { method: 'POST', body: payload });
  return fg('/packages', { method: 'POST', body: payload });
}

export async function getPackage(packageId) {
  return fg(`/packages/${encodeURIComponent(packageId)}`);
}

export async function deletePackage(packageId) {
  return fg(`/packages/${encodeURIComponent(packageId)}`, { method: 'DELETE' });
}

export async function getTracking(packageId) {
  const data = await fg(`/packages/${encodeURIComponent(packageId)}/tracking`);
  const list = Array.isArray(data) ? data : (data?.tracking || []);
  return list.map((t) => ({
    datetime: t.datetime || t.date || null,
    status: t.status || t.description || '',
    branch: t.branch || t.location || '',
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DONE = ['successful', 'success', 'completed', 'done', 'finished', 'processed', 'ok'];
const FAILED = ['failed', 'error', 'errors', 'unsuccessful', 'rejected', 'canceled', 'cancelled'];

// Polls an async "command" (order / cancel / documents) until it settles or
// the time budget runs out. Returns the last summary seen.
async function pollCommand(path, budgetMs) {
  const until = Date.now() + budgetMs;
  let last = null;
  do {
    last = await fg(path);
    const st = String(last?.status || '').toLowerCase();
    if (DONE.includes(st) || FAILED.includes(st)) return last;
    await sleep(900);
  } while (Date.now() < until);
  return last;
}

function commandErrors(summary) {
  const list = Array.isArray(summary?.errors) ? summary.errors : [];
  // Per-package errors can also sit under packages[].errors.
  for (const p of Array.isArray(summary?.packages) ? summary.packages : []) {
    if (Array.isArray(p?.errors)) list.push(...p.errors);
  }
  return list;
}

function commandResult(summary) {
  const st = String(summary?.status || '').toLowerCase();
  const errors = commandErrors(summary);
  if (FAILED.includes(st) || (errors.length && !DONE.includes(st))) {
    throw fgError(errorText(errors) || `Furgonetka odrzuciła zlecenie (status: ${st || 'brak'}).`, { details: summary });
  }
  return DONE.includes(st) ? 'done' : 'pending';
}

// Orders (buys) packages. Returns { uuid, result: 'done'|'pending' }.
export async function orderPackages(packageIds, { budgetMs = 8000 } = {}) {
  const uuid = crypto.randomUUID();
  await fg(`/order-commands/${uuid}`, {
    method: 'PUT',
    body: {
      packages: packageIds.map((id) => ({ id: Number(id) || id })),
      label: { page_format: 'a6', file_format: 'pdf', add_cutting_line: false },
    },
  });
  const summary = await pollCommand(`/order-commands/${uuid}`, budgetMs);
  return { uuid, result: commandResult(summary), status: summary?.status || null };
}

export async function orderCommandStatus(uuid) {
  const summary = await fg(`/order-commands/${encodeURIComponent(uuid)}`);
  return { result: commandResult(summary), status: summary?.status || null };
}

// A package counts as ordered once it has a tracking number or has left the
// draft state — this is the source of truth, whatever the command reports.
const DRAFT_STATES = ['waiting', 'cart', 'in_cart', 'draft', 'new', 'saved'];
export function packageLooksOrdered(pkg) {
  if (!pkg) return false;
  if (pkg.trackingNumber) return true;
  const st = String(pkg.state || '').toLowerCase();
  return !!st && !DRAFT_STATES.includes(st) && !['cancelled', 'canceled'].includes(st);
}

export async function cancelPackages(packageIds, { budgetMs = 6000 } = {}) {
  const uuid = crypto.randomUUID();
  await fg(`/cancel-command/${uuid}`, {
    method: 'PUT',
    body: { packages: packageIds.map((id) => ({ id: Number(id) || id })) },
  });
  const summary = await pollCommand(`/cancel-command/${uuid}`, budgetMs);
  return { uuid, result: commandResult(summary) };
}

async function fetchPdf(url) {
  const res = await fetch(url);
  if (!res.ok) throw fgError(`Nie udało się pobrać pliku etykiety (HTTP ${res.status}).`, { status: res.status });
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'application/pdf' };
}

// Label payload shapes seen in the wild: raw PDF, { file: base64 }, { label:
// { file | url } }, { url }. Normalise to { buffer, contentType }.
async function labelFromResponse(data) {
  if (data?.buffer) return data;
  const node = data?.label && typeof data.label === 'object' ? data.label : data;
  const b64 = node?.file || node?.content || node?.data;
  if (typeof b64 === 'string' && b64.length > 100) {
    return { buffer: Buffer.from(b64, 'base64'), contentType: 'application/pdf' };
  }
  const url = node?.url || node?.file_url || node?.download_url;
  if (typeof url === 'string' && /^https?:\/\//.test(url)) return fetchPdf(url);
  return null;
}

// Label for one package. `format`: 'a6' (label printer) | 'a4'.
export async function getLabel(packageId, { format = 'a6' } = {}) {
  const q = new URLSearchParams({ page_format: format, file_format: 'pdf' });
  try {
    const direct = await labelFromResponse(
      await fg(`/packages/${encodeURIComponent(packageId)}/label?${q}`, { raw: true }),
    );
    if (direct) return direct;
  } catch (err) {
    // Auth problems won't be fixed by the fallback; anything else might be.
    if (err.code === 'FURGONETKA_AUTH' || err.code === 'FURGONETKA_2FA') throw err;
  }
  return getDocuments([packageId], { format });
}

// One merged PDF of labels for many packages (bulk printing).
export async function getDocuments(packageIds, { format = 'a6', budgetMs = 9000 } = {}) {
  const uuid = crypto.randomUUID();
  await fg(`/documents-command/${uuid}`, {
    method: 'PUT',
    body: {
      packages: packageIds.map((id) => ({ id: Number(id) || id })),
      documents_types: ['labels'],
      label: { page_format: format, file_format: 'pdf', add_cutting_line: format === 'a4' },
    },
  });
  const summary = await pollCommand(`/documents-command/${uuid}`, budgetMs);
  if (commandResult(summary) !== 'done' || !summary?.url) {
    throw fgError('Etykiety są jeszcze generowane. Spróbuj ponownie za chwilę.', { status: 404, details: summary });
  }
  return fetchPdf(summary.url);
}

// Account balance, handy for the panel's config check. Best-effort.
export async function accountBalance() {
  try {
    const d = await fg('/account/balance');
    return d?.balance ?? d?.amount ?? null;
  } catch { return null; }
}

// Human-readable, admin-facing message for any Furgonetka error.
export function furgonetkaErrorMessage(err) {
  if (err?.code === 'NO_FURGONETKA_CONFIG') {
    return err.message === 'missing_furgonetka_config'
      ? 'Integracja Furgonetka nie jest skonfigurowana. Ustaw FURGONETKA_CLIENT_ID, FURGONETKA_CLIENT_SECRET, FURGONETKA_USERNAME i FURGONETKA_PASSWORD.'
      : err.message;
  }
  if (err?.code === 'FURGONETKA_2FA') {
    return 'Konto Furgonetki ma włączone logowanie dwuetapowe (2FA). Wyłącz 2FA dla konta używanego przez API albo użyj osobnego konta.';
  }
  if (err?.code === 'FURGONETKA_AUTH' || err?.code === 'FURGONETKA_NO_SERVICE') return err.message;
  if (err?.code === 'FURGONETKA_ERROR') {
    if (err.status === 404) return err.message || 'Nie znaleziono zasobu w Furgonetce.';
    return `Furgonetka: ${err.message}`;
  }
  return 'Błąd integracji Furgonetka.';
}
