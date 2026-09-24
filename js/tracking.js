/* ============================================
   FBT OUTLET — Śledzenie zamówienia
   Numer zamówienia + e-mail -> status, numer
   przesyłki i historia z /api/order-status.
   ============================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('track-form');
  if (!form) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => { try { return new Date(s).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s || ''; } };

  const params = new URLSearchParams(location.search);
  if (params.get('zamowienie')) $('t-order').value = params.get('zamowienie');
  if (params.get('email')) $('t-email').value = params.get('email');

  function showError(msg) {
    $('t-error').hidden = !msg;
    $('t-error').textContent = msg || '';
  }

  function render(d) {
    const rows = [
      ['Zamówienie', esc(d.id)],
      ['Status', `<span class="st">${esc(d.statusLabel)}</span>`],
      ['Dostawa', esc(d.shippingLabel || '—') + (d.point ? `<br>Punkt: ${esc(d.point)}${d.pointName ? ` (${esc(d.pointName)})` : ''}` : '')],
      ['Nr przesyłki', d.trackingNumber
        ? `${esc(d.trackingNumber)}${d.trackingUrl ? ` · <a href="${esc(d.trackingUrl)}" target="_blank" rel="noopener">śledź u przewoźnika →</a>` : ''}`
        : 'Pojawi się po nadaniu paczki'],
    ];
    const events = (d.events || []).map((e) => `
      <li><time>${esc(fmt(e.datetime))}${e.branch ? ' · ' + esc(e.branch) : ''}</time>${esc(e.status)}</li>`).join('');
    $('t-result').innerHTML = `<div class="kv">${rows.map(([k, v]) => `<b>${k}</b><div>${v}</div>`).join('')}</div>`
      + (events ? `<ol class="track-events">${events}</ol>` : '');
    $('t-result').hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    $('t-result').hidden = true;
    const order = $('t-order').value.trim().toUpperCase();
    const email = $('t-email').value.trim();
    if (!order || !email) { showError('Podaj numer zamówienia i e-mail.'); return; }
    const btn = $('t-submit');
    btn.disabled = true;
    try {
      const q = new URLSearchParams({ order, email });
      const res = await fetch('/api/order-status?' + q.toString(), { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Nie udało się sprawdzić zamówienia.');
      render(data);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  if ($('t-order').value && $('t-email').value) form.requestSubmit();
})();
