// Lightweight transactional e-mail via the Resend HTTP API.
// Works on serverless without extra dependencies (plain fetch).
//
// Configure with env vars:
//   RESEND_API_KEY   – API key from https://resend.com (required to send)
//   MAIL_FROM        – verified sender, e.g. "FBT Outlet <kontakt@fbtoutlet.pl>"
//   PUBLIC_BASE_URL  – site origin used to build links (e.g. https://fbtoutlet.pl)
//
// When RESEND_API_KEY is missing the helpers no-op gracefully so the rest of
// the order flow keeps working (nothing is thrown to the webhook).

import { trackingUrlFor } from './commerce.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function mailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function mailFrom() {
  return process.env.MAIL_FROM || 'FBT Outlet <kontakt@fbtoutlet.pl>';
}

function siteUrl() {
  const u = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://fbtoutlet.pl';
  return u.replace(/\/+$/, '');
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const zl = (grosze) => (Number(grosze || 0) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

// Sends one e-mail. Returns { skipped } / { id } / { error } — never throws.
export async function sendMail({ to, subject, html, text }) {
  if (!mailConfigured()) return { skipped: true, reason: 'no_api_key' };
  if (!to) return { skipped: true, reason: 'no_recipient' };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: mailFrom(), to: [to], subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[mailer] send failed', res.status, data);
      return { error: data?.message || `HTTP ${res.status}` };
    }
    return { id: data?.id };
  } catch (err) {
    console.error('[mailer] send error', err?.message);
    return { error: err?.message || 'send_error' };
  }
}

// Order confirmation + "parcel is being prepared" notification.
export async function sendOrderPreparingEmail(order) {
  if (!order?.customer?.email) return { skipped: true, reason: 'no_email' };

  const site = siteUrl();
  const name = order.customer.name || '';
  const tracking = order.trackingNumber || '';
  const trackUrl = trackingUrlFor(order.shippingMethod, tracking) || orderTrackUrl(site, order);

  const itemsRows = (order.items || []).map((it) => `
    <tr>
      <td style="padding:6px 0;color:#111">${esc(it.name)}${it.size ? ` · rozm. ${esc(it.size)}` : ''} × ${esc(it.qty)}</td>
      <td style="padding:6px 0;color:#111;text-align:right;white-space:nowrap">${zl((it.price || 0) * (it.qty || 1))}</td>
    </tr>`).join('');

  const shipLine = shippingLine(order);

  const trackingBlock = tracking ? `
    <p style="margin:16px 0 6px;color:#111">Numer przesyłki: <strong>${esc(tracking)}</strong></p>
    <p style="margin:0 0 16px"><a href="${trackUrl}" style="color:#e01020;font-weight:600">Śledź przesyłkę →</a></p>` : '';

  const subject = `Twoje zamówienie ${order.id} jest przygotowywane`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h1 style="font-size:20px;margin:0 0 4px">Dziękujemy za zamówienie${name ? `, ${esc(name)}` : ''}!</h1>
    <p style="color:#555;margin:0 0 16px">Twoja paczka jest już przygotowywana do wysyłki.</p>
    <p style="margin:0 0 4px;color:#111">Numer zamówienia: <strong>${esc(order.id)}</strong></p>
    <p style="margin:0 0 16px;color:#111">Dostawa: ${shipLine}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin:8px 0">
      ${itemsRows}
    </table>
    <p style="text-align:right;margin:10px 0;color:#111"><strong>Razem: ${zl(order.total)}</strong></p>
    ${trackingBlock}
    <p style="color:#555;font-size:13px;margin:20px 0 0">Damy Ci znać, gdy paczka będzie w drodze. W razie pytań napisz do nas na kontakt@fbtoutlet.pl.</p>
    <p style="color:#999;font-size:12px;margin:16px 0 0">FBT Outlet · Lubieszów 87, 67-100</p>
  </div>`;

  const text = `Dziękujemy za zamówienie${name ? `, ${name}` : ''}!\n`
    + `Twoja paczka jest przygotowywana do wysyłki.\n`
    + `Numer zamówienia: ${order.id}\n`
    + (tracking ? `Numer przesyłki: ${tracking}\nŚledzenie: ${trackUrl}\n` : '')
    + `Razem: ${zl(order.total)}\n\nFBT Outlet · kontakt@fbtoutlet.pl`;

  return sendMail({ to: order.customer.email, subject, html, text });
}

// Our /sledzenie page, pre-filled so the lookup runs on open.
function orderTrackUrl(site, order) {
  const q = new URLSearchParams({ zamowienie: order.id, email: order.customer?.email || '' });
  return `${site}/sledzenie.html?${q}`;
}

// "Dostawa: …" line: method + chosen pickup point (code and name), if any.
function shippingLine(order) {
  const method = esc(order.shippingLabel || order.shippingMethod || '');
  if (!order.inpostPoint) return method;
  return `${method}, punkt <strong>${esc(order.inpostPoint)}</strong>${order.pointName ? ` (${esc(order.pointName)})` : ''}`;
}

// "Your parcel has a tracking number" — sent once, when the label is ordered.
export async function sendOrderShippedEmail(order) {
  if (!order?.customer?.email) return { skipped: true, reason: 'no_email' };
  const tracking = order.trackingNumber;
  if (!tracking) return { skipped: true, reason: 'no_tracking' };

  const site = siteUrl();
  const name = order.customer.name || '';
  const carrierUrl = trackingUrlFor(order.shippingMethod, tracking);
  const trackUrl = carrierUrl || orderTrackUrl(site, order);

  const subject = `Zamówienie ${order.id}: przesyłka nadana`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h1 style="font-size:20px;margin:0 0 4px">Twoja paczka jest gotowa do drogi${name ? `, ${esc(name)}` : ''}!</h1>
    <p style="color:#555;margin:0 0 16px">Przygotowaliśmy przesyłkę i nadaliśmy jej numer. Przewoźnik będzie informował Cię o kolejnych etapach doręczenia.</p>
    <p style="margin:0 0 4px;color:#111">Numer zamówienia: <strong>${esc(order.id)}</strong></p>
    <p style="margin:0 0 4px;color:#111">Dostawa: ${shippingLine(order)}</p>
    <p style="margin:12px 0 6px;color:#111">Numer przesyłki: <strong>${esc(tracking)}</strong></p>
    <p style="margin:0 0 16px"><a href="${trackUrl}" style="color:#e01020;font-weight:600">Śledź przesyłkę →</a></p>
    <p style="color:#555;font-size:13px;margin:20px 0 0">Status sprawdzisz też na <a href="${site}/sledzenie.html" style="color:#e01020">${esc(site.replace(/^https?:\/\//, ''))}/sledzenie</a> (numer zamówienia + e-mail). Pytania? kontakt@fbtoutlet.pl</p>
    <p style="color:#999;font-size:12px;margin:16px 0 0">FBT Outlet · Lubieszów 87, 67-100</p>
  </div>`;
  const text = `Twoja paczka jest gotowa do drogi!\n`
    + `Numer zamówienia: ${order.id}\nNumer przesyłki: ${tracking}\nŚledzenie: ${trackUrl}\n\nFBT Outlet · kontakt@fbtoutlet.pl`;

  return sendMail({ to: order.customer.email, subject, html, text });
}
