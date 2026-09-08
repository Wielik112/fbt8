/* ============================================
   FBT OUTLET — Checkout page
   Collects contact + delivery, mirrors pricing for
   display only (server re-prices authoritatively),
   then creates a Stripe Checkout session.
   ============================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  // Display-only mirror of api/_lib/commerce.js (server is authoritative).
  const SHIPPING = {
    inpost_locker:  { label: 'InPost Paczkomat 24/7', sub: 'Odbiór 24/7 w paczkomacie', price: 1299, requiresPoint: true },
    inpost_courier: { label: 'Kurier InPost',         sub: 'Dostawa pod wskazany adres', price: 1599, requiresPoint: false },
    courier:        { label: 'Kurier standardowy',    sub: 'Dostawa pod wskazany adres', price: 1999, requiresPoint: false },
  };
  const FREE_THRESHOLD = 30000; // grosze (300 zł)
  const COUPONS = { FBT15: 15, START10: 10 };

  const fmt = (gr) => (gr / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
  const gradients = ['linear-gradient(135deg,#2a0409,#1c1c22)', 'linear-gradient(135deg,#1c1c22,#320810)', 'linear-gradient(135deg,#151519,#2a0409)'];

  let method = 'inpost_locker';
  let discountPercent = 0;
  let discountCode = '';

  // Live product data (by id) so the summary shows the real, current product photo.
  let productMap = {};
  async function loadProductMap() {
    try {
      const r = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) data.forEach((p) => {
        if (p && p.id) productMap[p.id] = { image: p.image || '', gradient: p.gradient || '' };
      });
    } catch { /* offline — fall back to stored image */ }
  }

  function cart() { return (typeof getCart === 'function' ? getCart() : []); }
  function subtotalGrosze() { return cart().reduce((s, i) => s + Math.round(i.price * 100) * i.qty, 0); }

  function renderItems() {
    const box = $('co-items');
    box.innerHTML = cart().map((it, i) => {
      const live = productMap[it.id] || {};
      const img = live.image || it.image || '';
      const grad = live.gradient || gradients[i % 3];
      const imgStyle = img
        ? `background-image:url("${img}");background-size:cover;background-position:center`
        : `background:${grad}`;
      return `
      <div class="co-item">
        <div class="co-item-img" style="${imgStyle}"></div>
        <div>
          <div class="co-item-name">${it.name}</div>
          <div class="co-item-meta">${it.size ? 'Rozm. ' + it.size + ' · ' : ''}${it.qty} szt.</div>
        </div>
        <div class="co-item-price">${fmt(Math.round(it.price * 100) * it.qty)}</div>
      </div>`;
    }).join('');
  }

  function renderShipping() {
    const sub = subtotalGrosze();
    $('ship-options').innerHTML = Object.entries(SHIPPING).map(([key, m]) => {
      const cost = sub >= FREE_THRESHOLD ? 0 : m.price;
      return `
        <label class="ship-opt${key === method ? ' active' : ''}" data-method="${key}">
          <input type="radio" name="ship" value="${key}" ${key === method ? 'checked' : ''}>
          <div class="so-main">
            <div class="so-name">${m.label}</div>
            <div class="so-sub">${m.sub}</div>
          </div>
          <div class="so-price">${cost === 0 ? 'Gratis' : fmt(cost)}</div>
        </label>`;
    }).join('');

    $('ship-options').querySelectorAll('.ship-opt').forEach((el) => {
      el.addEventListener('click', () => {
        method = el.dataset.method;
        $('ship-options').querySelectorAll('.ship-opt').forEach((x) => x.classList.toggle('active', x === el));
        el.querySelector('input').checked = true;
        toggleDeliveryFields();
        renderTotals();
      });
    });
    toggleDeliveryFields();
  }

  function toggleDeliveryFields() {
    const needsPoint = SHIPPING[method].requiresPoint;
    $('inpost-box').hidden = !needsPoint;
    $('address-box').hidden = needsPoint;
  }

  function renderTotals() {
    const sub = subtotalGrosze();
    const ship = sub >= FREE_THRESHOLD ? 0 : SHIPPING[method].price;
    const disc = Math.round(sub * discountPercent / 100);
    const total = Math.max(0, sub - disc) + ship;

    $('co-sub').textContent = fmt(sub);
    $('co-ship').textContent = ship === 0 ? 'Gratis' : fmt(ship);
    $('co-total').textContent = fmt(total);
    const dl = $('co-disc-line');
    if (disc > 0) { dl.style.display = 'flex'; $('co-disc').textContent = '−' + fmt(disc); }
    else dl.style.display = 'none';
  }

  function showError(msg) {
    const box = $('co-error');
    if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
    box.style.display = 'block';
    box.textContent = msg;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---- Coupon ----
  $('co-promo-btn').addEventListener('click', () => {
    const code = $('co-promo-input').value.trim().toUpperCase();
    if (COUPONS[code]) { discountPercent = COUPONS[code]; discountCode = code; showToast(`Kod ${code}: −${COUPONS[code]}%`); }
    else { discountPercent = 0; discountCode = ''; showToast('Nieprawidłowy kod rabatowy'); }
    renderTotals();
  });

  // ---- InPost point selection ----
  $('c-point').addEventListener('input', () => {
    const v = $('c-point').value.trim().toUpperCase();
    $('c-point').value = v;
    $('point-picked').style.display = v ? 'block' : 'none';
    $('point-code').textContent = v;
  });

  $('pick-point-btn').addEventListener('click', openGeowidget);
  $('gw-close').addEventListener('click', closeGeowidget);

  let gwAssetsLoaded = false;
  function loadGeowidgetAssets() {
    if (gwAssetsLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://geowidget.inpost.pl/inpost-geowidget.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://geowidget.inpost.pl/inpost-geowidget.js';
      js.defer = true;
      js.onload = () => { gwAssetsLoaded = true; resolve(); };
      js.onerror = () => reject(new Error('geowidget load failed'));
      document.head.appendChild(js);
    });
  }

  function setPoint(code, name) {
    const v = String(code || '').trim().toUpperCase();
    $('c-point').value = v;
    $('point-picked').style.display = v ? 'block' : 'none';
    $('point-code').textContent = v;
    $('point-name').textContent = name ? ` — ${name}` : '';
  }

  function openGeowidget() {
    const token = window.FBT_CONFIG && window.FBT_CONFIG.inpostGeowidgetToken;
    if (!token) { showToast('Wpisz kod paczkomatu ręcznie'); $('c-point').focus(); return; }
    loadGeowidgetAssets().then(() => {
      const mount = $('geowidget-mount');
      mount.innerHTML = `<inpost-geowidget token="${token}" language="pl" config="parcelCollect247" style="width:100%;height:100%"></inpost-geowidget>`;
      const el = mount.querySelector('inpost-geowidget');
      el.addEventListener('onpoint', (e) => {
        const p = e.detail || {};
        const addr = (p.address && (p.address.line1 || p.address.line2)) || (p.location_description || '');
        setPoint(p.name, addr);
        closeGeowidget();
      }, { once: true });
      $('geowidget-modal').style.display = 'grid';
    }).catch(() => { showToast('Nie udało się załadować mapy. Wpisz kod ręcznie.'); $('c-point').focus(); });
  }
  function closeGeowidget() { $('geowidget-modal').style.display = 'none'; $('geowidget-mount').innerHTML = ''; }

  // ---- Submit ----
  $('co-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    if (!cart().length) { showError('Twój koszyk jest pusty.'); return; }

    const email = $('c-email').value.trim();
    const name = $('c-name').value.trim();
    const phone = $('c-phone').value.trim();
    if (!email || !name || !phone) { showError('Uzupełnij dane kontaktowe.'); return; }

    const shipping = { method };
    if (SHIPPING[method].requiresPoint) {
      const point = $('c-point').value.trim();
      if (!point) { showError('Wybierz lub wpisz kod paczkomatu InPost.'); return; }
      shipping.point = point;
    } else {
      const street = $('c-street').value.trim();
      const postcode = $('c-postcode').value.trim();
      const city = $('c-city').value.trim();
      if (!street || !postcode || !city) { showError('Uzupełnij adres dostawy.'); return; }
      shipping.address = { street, postcode, city, country: 'PL' };
    }

    const payload = {
      items: cart().map((i) => ({ id: i.id, qty: i.qty, size: i.size || null })),
      customer: { email, name, phone },
      shipping,
      coupon: discountCode || undefined,
    };

    const btn = $('co-pay');
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.textContent = 'Przekierowanie do płatności…';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || 'Nie udało się rozpocząć płatności.');
      window.location.href = data.url; // redirect to Stripe Checkout
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  // ---- Boot ----
  (function boot() {
    if (!cart().length) {
      $('co-empty').hidden = false;
      $('co-form').hidden = true;
      return;
    }
    $('co-empty').hidden = true;
    $('co-form').hidden = false;
    renderItems();
    renderShipping();
    renderTotals();
    // Pull live product photos, then re-render so the summary shows the real images.
    loadProductMap().then(renderItems);
  })();
})();
