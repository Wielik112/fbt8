/* ============================================
   FBT OUTLET — Dynamic product detail page
   Reads ?id=<id> and renders from /api/products/:id.
   Reuses productCard / renderProducts / FALLBACK_PRODUCTS
   from products.js (loaded before this script).
   ============================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const id = new URLSearchParams(location.search).get('id');
  const statusEl = $('#pd-status');
  const root = $('#pd-root');
  const DEFAULT_GRADIENT = 'linear-gradient(135deg,#2a0409,#1c1c22)';

  async function fetchJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  const fallback = () => (typeof FALLBACK_PRODUCTS !== 'undefined' ? FALLBACK_PRODUCTS : []);

  async function loadOne(pid) {
    try { return await fetchJSON(`/api/products/${encodeURIComponent(pid)}`); }
    catch { return fallback().find((p) => p.id === pid) || null; }
  }

  async function loadAll() {
    try { const d = await fetchJSON('/api/products'); if (Array.isArray(d) && d.length) return d; } catch { /* offline */ }
    return fallback();
  }

  function notFound() {
    statusEl.innerHTML = `
      <h1 style="font-family:var(--display);font-size:40px;margin-bottom:10px">Nie znaleziono produktu</h1>
      <p style="margin-bottom:24px;color:var(--grey-2)">Ten produkt nie istnieje lub został usunięty.</p>
      <a class="btn btn-primary" href="sklep.html">Wróć do sklepu</a>`;
    statusEl.hidden = false;
    root.hidden = true;
  }

  function defaultDesc(p) {
    return `${p.name} od ${p.brand}. ${p.cat} w outletowej cenie. Sprawdzona jakość i sportowy charakter. `
      + `Idealne uzupełnienie Twojej garderoby treningowej.`;
  }

  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Zamienia surowy opis (zwykły tekst z panelu) na czytelny HTML: akapity
  // oddzielone pustą linią, listy punktowane (linie od -, •, *) oraz pogrubione
  // etykiety typu „Podeszwa: guma" na początku linii. Dzięki temu opis wygląda
  // schludnie, nawet gdy jest to jeden wklejony blok tekstu.
  function formatDesc(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!raw) return '';
    const isBullet = (l) => /^\s*[-•*–]\s+/.test(l);
    const boldLabel = (l) => {
      const m = l.match(/^([^:\n]{2,40}):\s+(.*\S)\s*$/);
      return m ? `<strong>${escHtml(m[1])}:</strong> ${escHtml(m[2])}` : escHtml(l);
    };
    const bulletItem = (l) => `<li>${boldLabel(l.replace(/^\s*[-•*–]\s+/, ''))}</li>`;
    // Bloki oddzielone jedną lub wieloma pustymi liniami.
    return raw.split(/\n{2,}/).map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';
      // Pojedyncza krótka linia zakończona „:" → nagłówek sekcji.
      if (lines.length === 1 && /:\s*$/.test(lines[0]) && lines[0].length <= 40) {
        return `<h4 class="pd-desc-h">${escHtml(lines[0].replace(/:\s*$/, ''))}</h4>`;
      }
      // Grupuj ciągi punktów w listę, pozostałe linie w akapity — zachowując
      // kolejność (np. „Cechy:" + lista punktów w jednym bloku).
      const out = [];
      let para = [];
      let bullets = [];
      const flushPara = () => { if (para.length) { out.push(`<p>${para.map(boldLabel).join('<br>')}</p>`); para = []; } };
      const flushBullets = () => { if (bullets.length) { out.push(`<ul class="pd-desc-list">${bullets.map(bulletItem).join('')}</ul>`); bullets = []; } };
      lines.forEach((l) => {
        if (isBullet(l)) { flushPara(); bullets.push(l); }
        else { flushBullets(); para.push(l); }
      });
      flushPara(); flushBullets();
      return out.join('');
    }).filter(Boolean).join('');
  }

  function render(p, all) {
    document.title = `${p.name} | FBT Outlet`;

    // Dostępność: produkt jest „w magazynie", jeśli którykolwiek rozmiar nie
    // jest wyprzedany (rozmiary bez określonej ilości traktujemy jako dostępne).
    const anyInStock = (() => {
      const ss = Array.isArray(p.sizes) ? p.sizes : [];
      const st = (p.stock && typeof p.stock === 'object') ? p.stock : {};
      if (!ss.length) return true;
      return ss.some((s) => !(Object.prototype.hasOwnProperty.call(st, s) && (Number(st[s]) || 0) <= 0));
    })();
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', (p.description || defaultDesc(p)).slice(0, 155));

    // Structured data (Product) for richer Google results.
    try {
      const origin = location.origin;
      const img = p.image ? (p.image.startsWith('http') || p.image.startsWith('data:') ? p.image : origin + '/' + p.image.replace(/^\//, '')) : origin + '/assets/logo.png';
      const ld = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.name,
        image: [img],
        description: (p.description || defaultDesc(p)).slice(0, 300),
        sku: String(p.id).toUpperCase(),
        brand: { '@type': 'Brand', name: p.brand },
        category: p.cat,
        itemCondition: 'https://schema.org/NewCondition',
        offers: {
          '@type': 'Offer',
          price: String(p.price),
          priceCurrency: 'PLN',
          availability: anyInStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: origin + '/produkt.html?id=' + encodeURIComponent(p.id)
        }
      };
      let s = document.getElementById('ld-product');
      if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ld-product'; document.head.appendChild(s); }
      s.textContent = JSON.stringify(ld);
    } catch { /* non-critical */ }

    $('#pd-crumb').textContent = p.name;
    $('#pd-name').textContent = p.name;
    $('#pd-tag').textContent = [p.tag, p.condition].filter(Boolean).join(' · ');

    // Ceny per rozmiar: wybrany rozmiar może mieć inną cenę niż bazowa.
    const prices = (p.prices && typeof p.prices === 'object') ? p.prices : {};
    function effectivePrice(size) {
      if (size && Object.prototype.hasOwnProperty.call(prices, size)) {
        const v = Number(prices[size]);
        if (Number.isFinite(v) && v >= 0) return v;
      }
      return p.price;
    }
    function updatePrice(size) {
      const pr = effectivePrice(size);
      $('#pd-price').textContent = `${pr} zł`;
      const addB = $('#pd-add');
      if (addB) addB.dataset.price = pr;
      const was = $('#pd-old'); const save = $('#pd-save');
      if (p.old && p.old > pr) {
        if (was) { was.textContent = `${p.old} zł`; was.hidden = false; }
        if (save) { save.textContent = `Oszczędzasz ${p.old - pr} zł`; save.hidden = false; }
      } else {
        if (was) was.hidden = true;
        if (save) save.hidden = true;
      }
    }
    updatePrice(null); // stan początkowy (nadpisany po wyborze rozmiaru)

    // Photo gallery: main photo first, then any extra gallery photos.
    const gallery = [p.image, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean);
    const mainEl = $('#pd-main');
    const mainLogo = $('#pd-main-logo');
    const prevBtn = $('#pd-prev');
    const nextBtn = $('#pd-next');
    let curIdx = 0;
    mainLogo.alt = p.name;
    if (gallery.length) {
      mainEl.classList.add('has-photo');
      mainLogo.src = gallery[0];
      mainLogo.style.width = '100%';
      mainLogo.style.height = '100%';
      mainLogo.style.objectFit = 'contain';
      mainLogo.style.padding = '30px';
      mainLogo.style.opacity = '1';
    } else {
      mainEl.style.background = p.gradient || DEFAULT_GRADIENT;
    }

    const descText = (p.description && p.description.trim()) ? p.description : defaultDesc(p);
    $('#pd-desc').innerHTML = formatDesc(descText);

    // Specyfikacja (cechy) — czytelna tabelka.
    const escS = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const specs = Array.isArray(p.specs) ? p.specs.filter((s) => s && (s.k || s.label) && (s.v || s.value)) : [];
    if (specs.length) {
      const box = $('#pd-specs');
      box.innerHTML = specs.map((s) =>
        `<div class="spec"><span class="sk">${escS(s.k ?? s.label)}</span><span class="sv">${escS(s.v ?? s.value)}</span></div>`).join('');
      box.hidden = false;
    }

    // Sizes + stan magazynowy (per rozmiar)
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const stock = (p.stock && typeof p.stock === 'object') ? p.stock : {};
    const managed = (s) => Object.prototype.hasOwnProperty.call(stock, s);
    const soldOut = (s) => managed(s) && (Number(stock[s]) || 0) <= 0;
    const qtyInput = document.querySelector('.pd-qty-row .qty input');
    const pdAddBtn = $('#pd-add');

    function applyStock() {
      const active = $('#pd-sizes .pd-size.active');
      if (qtyInput) {
        const st = active?.dataset.stock;
        if (st !== undefined) {
          const max = Math.max(1, parseInt(st, 10) || 0);
          qtyInput.dataset.max = String(max);
          if ((+qtyInput.value || 1) > max) qtyInput.value = max;
        } else {
          delete qtyInput.dataset.max;
        }
      }
      // Zaktualizuj cenę pod wybrany rozmiar.
      updatePrice(active ? active.dataset.size : null);
      // Wyłącz „Dodaj do koszyka", gdy nie ma dostępnego rozmiaru.
      const anyAvail = sizes.some((s) => !soldOut(s));
      if (pdAddBtn) {
        pdAddBtn.disabled = !anyAvail || !active || active.classList.contains('out');
        pdAddBtn.classList.toggle('is-out', pdAddBtn.disabled);
      }
    }

    if (sizes.length) {
      const box = $('#pd-sizes');
      const firstAvail = sizes.find((s) => !soldOut(s));
      box.innerHTML = sizes.map((s) => {
        const out = soldOut(s);
        const badge = managed(s) ? (out ? 'brak' : `${Number(stock[s])} szt.`) : '';
        return `<span class="pd-size${s === firstAvail ? ' active' : ''}${out ? ' out' : ''}" data-size="${esc(s)}"${managed(s) ? ` data-stock="${Number(stock[s]) || 0}"` : ''}>
          <span class="ps-label">${esc(s)}</span>${badge ? `<span class="ps-stock">${badge}</span>` : ''}</span>`;
      }).join('');
      box.querySelectorAll('.pd-size').forEach((el) => el.addEventListener('click', () => {
        if (el.classList.contains('out')) return; // rozmiar niedostępny
        box.querySelectorAll('.pd-size').forEach((x) => x.classList.remove('active'));
        el.classList.add('active');
        applyStock();
      }));
      applyStock();
    } else {
      $('#pd-size-wrap').hidden = true;
    }

    // Meta
    $('#pd-code').textContent = 'FBT-' + String(p.id).toUpperCase();
    if (p.code && p.code.trim()) {
      const code = p.code.trim();
      $('#pd-mcode').textContent = code;
      $('#pd-code-verify').hidden = false;
      const copyBtn = $('#pd-code-copy');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        const done = () => { copyBtn.textContent = 'Skopiowano'; setTimeout(() => { copyBtn.textContent = 'Kopiuj'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(done);
        } else {
          const t = document.createElement('textarea'); t.value = code; document.body.appendChild(t);
          t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove(); done();
        }
      });
    }
    $('#pd-brand').textContent = p.brand;
    $('#pd-cat').textContent = p.cat;
    const genderEl = $('#pd-gender');
    if (genderEl) genderEl.textContent = p.gender || 'Unisex';
    $('#pd-cond').textContent = `${p.condition} · Kat. A`;
    if (p.level) { $('#pd-level').textContent = p.level; $('#pd-level-row').hidden = false; }
    if (p.surface) { $('#pd-surface').textContent = p.surface; $('#pd-surface-row').hidden = false; }
    if (p.garment) { $('#pd-garment').textContent = p.garment; $('#pd-garment-row').hidden = false; }
    if (p.note && p.note.trim()) { $('#pd-note-text').textContent = p.note.trim(); $('#pd-note').hidden = false; }

    // Add-to-cart: main.js already bound the click handler to this button;
    // it reads these data-* attributes at click time.
    const addBtn = $('#pd-add');
    addBtn.dataset.add = p.id;
    addBtn.dataset.name = p.name;
    addBtn.dataset.price = p.price;
    addBtn.dataset.image = gallery.length ? gallery[0] : '';

    // Galeria: miniatury w jednym rzędzie + strzałki na głównym zdjęciu.
    const thumbs = $('#pd-thumbs');
    if (gallery.length) {
      thumbs.innerHTML = gallery.map((src, i) =>
        `<div class="pd-thumb has-photo${i === 0 ? ' active' : ''}" data-idx="${i}"><img src="${src}" alt=""></div>`).join('');
      const thumbEls = Array.from(thumbs.querySelectorAll('.pd-thumb'));

      // Pokazuje zdjęcie o indeksie i (zapętla), podświetla i przewija miniaturę.
      const showPhoto = (i) => {
        curIdx = (i + gallery.length) % gallery.length;
        mainLogo.src = gallery[curIdx];
        thumbEls.forEach((x, k) => x.classList.toggle('active', k === curIdx));
        const act = thumbEls[curIdx];
        if (act && act.scrollIntoView) act.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      };

      thumbEls.forEach((t) => t.addEventListener('click', () => showPhoto(Number(t.dataset.idx))));

      const multi = gallery.length > 1;
      if (prevBtn) { prevBtn.hidden = !multi; prevBtn.addEventListener('click', () => showPhoto(curIdx - 1)); }
      if (nextBtn) { nextBtn.hidden = !multi; nextBtn.addEventListener('click', () => showPhoto(curIdx + 1)); }
      if (multi) {
        document.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft') showPhoto(curIdx - 1);
          else if (e.key === 'ArrowRight') showPhoto(curIdx + 1);
        });
      }
      showPhoto(0);
    } else {
      // Brak zdjęć — dekoracyjne kafelki gradientowe, bez strzałek.
      if (prevBtn) prevBtn.hidden = true;
      if (nextBtn) nextBtn.hidden = true;
      const grads = [p.gradient || DEFAULT_GRADIENT,
        'linear-gradient(135deg,#2a0409,#0f0f12)',
        'linear-gradient(135deg,#151519,#2a0409)',
        'linear-gradient(315deg,#320810,#1c1c22)'];
      thumbs.innerHTML = grads.map((g, i) => `<div class="pd-thumb${i === 0 ? ' active' : ''}" data-bg="${g}"></div>`).join('');
      thumbs.querySelectorAll('.pd-thumb').forEach((t) => t.addEventListener('click', () => {
        thumbs.querySelectorAll('.pd-thumb').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        if (t.dataset.bg) mainEl.style.background = t.dataset.bg;
      }));
    }

    // Related: prefer same category, then fill with others
    let rel = all.filter((x) => x.id !== p.id && x.cat === p.cat);
    if (rel.length < 4) rel = rel.concat(all.filter((x) => x.id !== p.id && x.cat !== p.cat));
    rel = rel.slice(0, 4);
    if (rel.length && typeof renderProducts === 'function') {
      renderProducts('#pd-related', rel);
      $('#pd-related-sec').hidden = false;
    }

    statusEl.hidden = true;
    root.hidden = false;
  }

  (async function boot() {
    if (!id) { notFound(); return; }
    const [p, all] = await Promise.all([loadOne(id), loadAll()]);
    if (!p) { notFound(); return; }
    render(p, all);
  })();
})();
