/* ============================================
   FBT OUTLET — Customer reviews (opinie)
   Loads from /api/reviews and lets customers add one.
   ============================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const grid = $('#reviews-grid');
  const countEl = $('#rv-count');
  const form = $('#review-form');
  const notice = $('#review-notice');

  let reviews = [];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function stars(n) {
    n = Math.min(5, Math.max(1, Number(n) || 0));
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function setNotice(msg, kind) {
    if (!notice) return;
    if (!msg) { notice.innerHTML = ''; return; }
    notice.innerHTML = `<div class="rv-msg ${kind === 'ok' ? 'rv-ok' : 'rv-err'}">${esc(msg)}</div>`;
  }

  function cardHTML(r) {
    return `
      <article class="review-card">
        <div class="review-stars">${stars(r.rating)}</div>
        <p class="review-body">${esc(r.body)}</p>
        <div class="review-foot">
          <span>Zamówienie ${esc(r.orderNo)}</span>
          <span>${esc(fmtDate(r.createdAt))}</span>
        </div>
      </article>`;
  }

  function render() {
    if (countEl) countEl.textContent = reviews.length ? `(${reviews.length})` : '';
    if (!reviews.length) {
      grid.innerHTML = '<p class="rv-empty">Brak opinii. Bądź pierwszy i podziel się wrażeniami!</p>';
      return;
    }
    grid.innerHTML = reviews.map(cardHTML).join('');
  }

  async function load() {
    try {
      const res = await fetch('/api/reviews', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      reviews = await res.json();
      render();
    } catch {
      grid.innerHTML = '<p class="rv-empty">Nie udało się wczytać opinii. Spróbuj odświeżyć stronę.</p>';
    }
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setNotice('', 'err');
    const payload = {
      orderNo: $('#rv-order').value.trim(),
      rating: $('#rv-rating').value,
      body: $('#rv-body').value.trim(),
    };
    const btn = $('#rv-submit');
    btn.disabled = true;
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nie udało się dodać opinii.');
      reviews.unshift(data);
      render();
      form.reset();
      setNotice('Dziękujemy! Twoja opinia została dodana.', 'ok');
    } catch (err) {
      setNotice(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  load();
})();
