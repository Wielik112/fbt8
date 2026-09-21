/* ============================================
   FBT OUTLET — Checkout page
   Collects contact + delivery, mirrors pricing for
   display only (server re-prices authoritatively),
   then creates a Stripe Checkout session.
   ============================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  // Display-only mirror of api/_lib/commerce.js (server is authoritative).
  // Ceny w groszach; progi: 1-2 pary (maxQty 2) oraz 3+ par (Infinity).
  const SHIPPING = {
    // Odbiór w punkcie / paczkomacie
    dpd_point:      { label: 'DPD Pickup (punkt)',      sub: 'Odbiór w punkcie DPD Pickup',       requiresPoint: true,  carrier: 'dpd',
                      tiers: [{ maxQty: 2, price: 1300 }, { maxQty: Infinity, price: 1500 }] },
    pocztex_point:  { label: 'Pocztex (punkt/automat)', sub: 'Odbiór w punkcie lub automacie Pocztex', requiresPoint: true, carrier: 'pocztex',
                      tiers: [{ maxQty: 2, price: 1400 }, { maxQty: Infinity, price: 1400 }] },
    inpost_locker:  { label: 'InPost Paczkomat 24/7',   sub: 'Odbiór 24/7 w paczkomacie',         requiresPoint: true,  carrier: 'inpost',
                      tiers: [{ maxQty: 2, price: 1700 }, { maxQty: Infinity, price: 2000 }] },
    orlen_point:    { label: 'Orlen Paczka (punkt)',    sub: 'Odbiór w punkcie Orlen Paczka',     requiresPoint: true,  carrier: 'orlen',
                      tiers: [{ maxQty: 2, price: 1500 }, { maxQty: Infinity, price: 1600 }] },
    // Kurier na adres
    dpd_courier:    { label: 'Kurier DPD',              sub: 'Dostawa kurierem pod adres',        requiresPoint: false, carrier: 'dpd',
                      tiers: [{ maxQty: 2, price: 2400 }, { maxQty: Infinity, price: 2800 }] },
    pocztex_courier:{ label: 'Kurier Pocztex',          sub: 'Dostawa kurierem pod adres',        requiresPoint: false, carrier: 'pocztex',
                      tiers: [{ maxQty: 2, price: 1500 }, { maxQty: Infinity, price: 1500 }] },
    inpost_courier: { label: 'Kurier InPost',           sub: 'Dostawa kurierem pod adres',        requiresPoint: false, carrier: 'inpost',
                      tiers: [{ maxQty: 2, price: 1900 }, { maxQty: Infinity, price: 2300 }] },
  };
  // Kolejność i nagłówki grup w wyborze dostawy.
  const SHIP_GROUPS = [
    { title: 'Odbiór w punkcie / paczkomacie', keys: ['dpd_point', 'pocztex_point', 'inpost_locker', 'orlen_point'] },
    { title: 'Kurier na adres',                keys: ['dpd_courier', 'pocztex_courier', 'inpost_courier'] },
  ];
  // Liczba sztuk w koszyku decyduje o progu ceny dostawy.
  function cartQty() { return cart().reduce((s, i) => s + i.qty, 0) || 1; }
  function shipPrice(key) {
    const m = SHIPPING[key]; if (!m) return 0;
    const q = cartQty();
    const tier = m.tiers.find((t) => q <= t.maxQty) || m.tiers[m.tiers.length - 1];
    return tier.price;
  }
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
      return `
      <div class="co-item">
        <div class="co-item-img${img ? ' has-photo' : ''}"${img ? '' : ` style="background:${grad}"`}>${img ? `<img src="${img}" alt="">` : ''}</div>
        <div>
          <div class="co-item-name">${it.name}</div>
          <div class="co-item-meta">${it.size ? 'Rozm. ' + it.size + ' · ' : ''}${it.qty} szt.</div>
        </div>
        <div class="co-item-price">${fmt(Math.round(it.price * 100) * it.qty)}</div>
      </div>`;
    }).join('');
  }

  function renderShipping() {
    $('ship-options').innerHTML = SHIP_GROUPS.map((g) => {
      const opts = g.keys.map((key) => {
        const m = SHIPPING[key];
        const cost = shipPrice(key);
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
      return `<div class="ship-group"><div class="ship-group-title">${g.title}</div>${opts}</div>`;
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
    const m = SHIPPING[method];
    const needsPoint = m.requiresPoint;
    $('inpost-box').hidden = !needsPoint;
    $('address-box').hidden = needsPoint;
    if (needsPoint) {
      const isInpost = m.carrier === 'inpost';
      const lbl = $('point-label');
      const pickBtn = $('pick-point-btn');
      // Mapa Furgonetki obsługuje wszystkie sieci punktów (InPost, Poczta,
      // DPD, Orlen), więc przycisk wyboru na mapie pokazujemy zawsze.
      if (lbl) lbl.textContent = isInpost ? 'Kod paczkomatu (np. KRA010)' : 'Kod punktu odbioru';
      $('c-point').placeholder = 'Wybierz na mapie lub wpisz kod ręcznie';
      if (pickBtn) { pickBtn.hidden = false; pickBtn.textContent = 'Wybierz punkt na mapie'; }
    }
  }

  function renderTotals() {
    const sub = subtotalGrosze();
    const ship = shipPrice(method);
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

  // ---- Point selection (wpisanie ręczne) ----
  $('c-point').addEventListener('input', () => {
    // Kody paczkomatów InPost są wielkimi literami; adresy innych punktów nie.
    if (SHIPPING[method] && SHIPPING[method].carrier === 'inpost') {
      $('c-point').value = $('c-point').value.toUpperCase();
    }
    const v = $('c-point').value.trim();
    $('point-picked').style.display = v ? 'block' : 'none';
    $('point-code').textContent = v;
    $('point-name').textContent = '';
  });

  $('pick-point-btn').addEventListener('click', openPointMap);

  // ---- Invoice (optional) ----
  $('c-invoice').addEventListener('change', () => {
    $('invoice-box').hidden = !$('c-invoice').checked;
  });

  // Zapisuje wybrany punkt: kod trafia do #c-point (a stąd do zamówienia jako
  // shipping.point), nazwa jest pokazywana użytkownikowi.
  function setPoint(code, name) {
    const v = String(code || '').trim().toUpperCase();
    $('c-point').value = v;
    $('point-picked').style.display = v ? 'block' : 'none';
    $('point-code').textContent = v;
    $('point-name').textContent = name ? ` — ${name}` : '';
  }

  // Nasz przewoźnik -> sieć(-i) punktów w mapie Furgonetki.
  function fgServicesFor(carrier) {
    switch (carrier) {
      case 'inpost':  return ['inpost'];
      case 'dpd':     return ['dpd'];
      case 'orlen':   return ['orlen'];
      case 'pocztex': return ['poczta'];
      default:        return [];
    }
  }

  // Otwiera mapę punktów odbioru Furgonetki dla aktualnie wybranej metody.
  function openPointMap() {
    const m = SHIPPING[method];
    if (!m || !m.requiresPoint) return;
    if (!window.Furgonetka || !window.Furgonetka.Map) {
      showToast('Mapa jeszcze się ładuje — spróbuj za chwilę lub wpisz kod ręcznie.');
      $('c-point').focus();
      return;
    }
    const apiKey = window.FBT_CONFIG && window.FBT_CONFIG.furgonetkaApiKey;
    if (!apiKey) { showToast('Wpisz kod punktu ręcznie'); $('c-point').focus(); return; }
    try {
      new window.Furgonetka.Map({
        apiKey,
        courierServices: fgServicesFor(m.carrier),
        callback: (params) => {
          const point = (params && params.point) || {};
          if (point.code) setPoint(point.code, point.name);
        },
      }).show();
    } catch (err) {
      console.error('[furgonetka map]', err);
      showToast('Nie udało się otworzyć mapy. Wpisz kod ręcznie.');
      $('c-point').focus();
    }
  }

  // ---- Submit ----
  $('co-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    if (!cart().length) { showError('Twój koszyk jest pusty.'); return; }

    if (!$('c-terms').checked) { showError('Zaakceptuj regulamin sklepu, aby złożyć zamówienie.'); return; }

    const email = $('c-email').value.trim();
    const name = $('c-name').value.trim();
    const phone = $('c-phone').value.trim();
    if (!email || !name || !phone) { showError('Uzupełnij dane kontaktowe.'); return; }

    const shipping = { method };
    if (SHIPPING[method].requiresPoint) {
      const point = $('c-point').value.trim();
      if (!point) {
        const isInpost = SHIPPING[method].carrier === 'inpost';
        showError(isInpost ? 'Wybierz lub wpisz kod paczkomatu InPost.' : 'Wpisz kod lub adres wybranego punktu odbioru.');
        return;
      }
      shipping.point = point;
    } else {
      const street = $('c-street').value.trim();
      const postcode = $('c-postcode').value.trim();
      const city = $('c-city').value.trim();
      if (!street || !postcode || !city) { showError('Uzupełnij adres dostawy.'); return; }
      shipping.address = { street, postcode, city, country: 'PL' };
    }

    let invoice;
    if ($('c-invoice').checked) {
      const company = $('inv-company').value.trim();
      const nip = $('inv-nip').value.replace(/[\s-]/g, '');
      const street = $('inv-street').value.trim();
      const postcode = $('inv-postcode').value.trim();
      const city = $('inv-city').value.trim();
      if (!company) { showError('Do faktury podaj nazwę firmy lub imię i nazwisko.'); return; }
      if (nip && !/^\d{10}$/.test(nip)) { showError('NIP powinien mieć 10 cyfr (lub zostaw puste).'); return; }
      if (!street || !postcode || !city) { showError('Uzupełnij adres do faktury (ulica, kod pocztowy, miasto).'); return; }
      invoice = { company, nip, street, postcode, city, country: 'PL' };
    }

    const payload = {
      items: cart().map((i) => ({ id: i.id, qty: i.qty, size: i.size || null })),
      customer: { email, name, phone },
      shipping,
      invoice,
      terms: true,
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
