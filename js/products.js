/* ============================================
   FBT OUTLET — Product catalog + card renderer
   Products load from /api/products (Vercel Postgres).
   If the API is unavailable (e.g. opened as a static
   file), the embedded FALLBACK_PRODUCTS are used.
   ============================================ */

const FALLBACK_PRODUCTS = [
  { id: 'p01', name: 'Predator Elite FG',       cat: 'Buty piłkarskie',      brand: 'Adidas',      condition: 'Nowy', level: 'Profesjonalne',    surface: 'Na trawę (lanki)',                 price: 649, old: 899, tag: '-28%',   tagType: 'sale', stars: 5, sizes: ['40','41','42','43','44'], colors: [], gradient: 'linear-gradient(135deg,#2a0409,#1c1c22)' },
  { id: 'p02', name: 'Phantom GX Pro FG',       cat: 'Buty piłkarskie',      brand: 'Nike',        condition: 'Nowy', level: 'Półprofesjonalne', surface: 'Na trawę (lanki)',                 price: 459, old: 649, tag: 'HIT',    tagType: 'hit',  stars: 5, sizes: ['40','41','42','43','44','45'], colors: [], gradient: 'linear-gradient(135deg,#1c1c22,#320810)' },
  { id: 'p03', name: 'Future Match TF',         cat: 'Buty piłkarskie',      brand: 'Puma',        condition: 'Nowy', level: 'Treningowe',       surface: 'Na sztuczną trawę/orlika (turfy)', price: 259, old: 359, tag: '-28%',   tagType: 'sale', stars: 4, sizes: ['40','41','42','43','44'], colors: [], gradient: 'linear-gradient(135deg,#151519,#2a0409)' },
  { id: 'p04', name: 'Mercurial Vapor SG',      cat: 'Buty piłkarskie',      brand: 'Nike',        condition: 'Nowy', level: 'Profesjonalne',    surface: 'Na mokrą trawę (wkręty/mixy)',     price: 589, old: 799, tag: 'NOWOŚĆ', tagType: 'new',  stars: 5, sizes: ['41','42','43','44','45'], colors: [], gradient: 'linear-gradient(135deg,#2a0409,#0f0f12)' },
  { id: 'p05', name: 'Copa Sala IN',            cat: 'Buty piłkarskie',      brand: 'Adidas',      condition: 'Nowy', level: 'Rekreacyjne',      surface: 'Na halę (halówki)',                price: 199, old: 279, tag: '-29%',   tagType: 'sale', stars: 4, sizes: ['39','40','41','42','43','44'], colors: [], gradient: 'linear-gradient(135deg,#1c1c22,#2a0409)' },
  { id: 'p06', name: 'Tiempo Legend TF',        cat: 'Buty piłkarskie',      brand: 'Nike',        condition: 'Nowy', level: 'Treningowe',       surface: 'Na sztuczną trawę/orlika (turfy)', price: 339, old: 469, tag: 'HIT',    tagType: 'hit',  stars: 5, sizes: ['40','41','42','43','44'], colors: [], gradient: 'linear-gradient(135deg,#320810,#151519)' },
  { id: 'p07', name: 'Predator GK Pro',         cat: 'Rękawice bramkarskie', brand: 'Adidas',      condition: 'Nowy', level: '',                 surface: '',                                 price: 219, old: 299, tag: '-27%',   tagType: 'sale', stars: 5, sizes: ['8','9','10','11'], colors: [], gradient: 'linear-gradient(135deg,#0f0f12,#2a0409)' },
  { id: 'p08', name: 'GK Vapor Grip3',          cat: 'Rękawice bramkarskie', brand: 'Nike',        condition: 'Nowy', level: '',                 surface: '',                                 price: 279, old: 379, tag: 'NOWOŚĆ', tagType: 'new',  stars: 4, sizes: ['8','9','10','11'], colors: [], gradient: 'linear-gradient(135deg,#2a0409,#1c1c22)' },
  { id: 'p09', name: 'Piłka meczowa Pro',       cat: 'Piłki',                brand: 'Adidas',      condition: 'Nowy', level: '',                 surface: '',                                 price: 159, old: 219, tag: '-27%',   tagType: 'sale', stars: 5, sizes: ['4','5'], colors: [], gradient: 'linear-gradient(135deg,#1c1c22,#320810)' },
  { id: 'p10', name: 'Piłka treningowa Club',   cat: 'Piłki',                brand: 'Nike',        condition: 'Nowy', level: '',                 surface: '',                                 price: 89,  old: 129, tag: 'HIT',    tagType: 'hit',  stars: 4, sizes: ['4','5'], colors: [], gradient: 'linear-gradient(135deg,#151519,#2a0409)' },
  { id: 'p11', name: 'Buty sportowe RunFlex',   cat: 'Buty sportowe',        brand: 'New Balance', condition: 'Nowy', level: '',                 surface: '',                                 price: 289, old: 399, tag: '-27%',   tagType: 'sale', stars: 5, sizes: ['40','41','42','43','44'], colors: [], gradient: 'linear-gradient(135deg,#2a0409,#0f0f12)' },
  { id: 'p12', name: 'Ochraniacze Guard Pro',   cat: 'Akcesoria',            brand: 'Puma',        condition: 'Nowy', level: '',                 surface: '',                                 price: 59,  old: 89,  tag: 'NOWOŚĆ', tagType: 'new',  stars: 5, sizes: ['S','M','L'], colors: [], gradient: 'linear-gradient(135deg,#1c1c22,#2a0409)' },
];

// Live catalog — replaced by API data once loaded.
let PRODUCTS = FALLBACK_PRODUCTS;

async function loadProducts() {
  try {
    const res = await fetch('/api/products', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data;
    }
  } catch { /* offline / static preview — fall back below */ }
  return FALLBACK_PRODUCTS;
}

// All products use the dynamic template produkt.html?id=<id>, which renders
// from the live catalog (API, or FALLBACK_PRODUCTS offline). The old
// hand-crafted produkt-pNN.html pages are no longer linked.
function productHref(p) {
  return `produkt.html?id=${encodeURIComponent(p.id)}`;
}

function productCard(p) {
  const condClass = p.condition === 'Nowy' ? 'cond-new' : 'cond-used';
  const oldPrice = p.old ? ` <span class="old">${p.old} zł</span>` : '';
  const href = productHref(p);
  const hasImg = !!p.image;
  const bg = (!hasImg && p.gradient) ? ` style="background:${p.gradient}"` : '';
  const media = hasImg ? `<img src="${p.image}" alt="${p.name}" loading="lazy">` : '';
  return `
  <article class="product-card reveal" data-product="${p.id}" data-name="${p.name}" data-price="${p.price}">
    <a class="card-link" href="${href}" aria-label="${p.name}"></a>
    <div class="product-media"${bg}>
      ${media}
      <div class="product-badges">
        ${p.tag ? `<span class="tag ${p.tagType === 'sale' ? '' : 'grey'}">${p.tag}</span>` : ''}
        <span class="tag ${condClass}">${p.condition} · Kat. A</span>
      </div>
    </div>
    <div class="product-info">
      <div class="product-cat">${p.brand} · ${p.cat}</div>
      <h3 class="product-name">${p.name}</h3>
      <div class="product-foot">
        <div class="product-price">${p.price} zł${oldPrice}</div>
      </div>
    </div>
  </article>`;
}

function renderProducts(selector, list) {
  const el = document.querySelector(selector);
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<p class="no-results">Brak produktów spełniających wybrane kryteria.</p>';
    return;
  }
  el.innerHTML = list.map(productCard).join('');
  el.querySelectorAll('.reveal').forEach((c, i) => { c.style.transitionDelay = `${(i % 4) * 70}ms`; if (typeof io !== 'undefined') io.observe(c); });
}

/* ---------- Page renderers ---------- */

function renderFeatured() {
  renderProducts('#featured-products', PRODUCTS.slice(0, 8));
}

// Polish plural for "produkt": 1 produkt, 2–4 produkty, else produktów.
function plProdukty(n) {
  if (n === 1) return 'produkt';
  const d = n % 10, h = n % 100;
  return (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) ? 'produkty' : 'produktów';
}

// Fills the homepage category tiles with the real number of products in
// each category (no more fake counts).
function fillCategoryCounts() {
  document.querySelectorAll('.cat-count[data-cat]').forEach((el) => {
    const n = PRODUCTS.filter((p) => p.cat === el.dataset.cat).length;
    el.textContent = `${n} ${plProdukty(n)}`;
  });
}

function renderRelated() {
  const rel = document.querySelector('#related-products');
  if (!rel) return;
  const ids = (rel.dataset.related || '').split(',').map(s => s.trim()).filter(Boolean);
  const list = ids.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  renderProducts('#related-products', list.length ? list : PRODUCTS.slice(0, 4));
}

/* ============================================
   SHOP PAGE — full filtering + sorting engine
   ============================================ */
function initShop() {
  const shopGrid = '#shop-products';
  if (!document.querySelector(shopGrid)) return;

  const state = {
    cat: 'Wszystkie',
    gender: 'Wszystkie',    // Wszystkie | Męskie | Damskie (Unisex shows in both)
    brand: 'Wszystkie',     // single active brand chip
    conditions: new Set(),  // empty = all
    sizes: new Set(),       // empty = all
    levels: new Set(),      // zaawansowanie — empty = all
    surfaces: new Set(),    // przeznaczenie — empty = all
    q: '',                  // free-text search (from ?q= or search overlay)
    priceMin: 0,
    priceMax: 2000,
    sort: 'default',
  };

  // Preselect a category/gender when arriving from a link (sklep.html?cat=…&gender=…).
  const params = new URLSearchParams(location.search);
  const wantedCat = params.get('cat');
  if (wantedCat && document.querySelector(`.chip[data-cat="${wantedCat}"]`)) {
    state.cat = wantedCat;
    document.querySelectorAll('.chip[data-cat]').forEach(c =>
      c.classList.toggle('active', c.dataset.cat === wantedCat));
    const radio = document.querySelector(`input[name="cat"][value="${wantedCat}"]`);
    if (radio) radio.checked = true;
  }
  const wantedGender = params.get('gender');
  if (wantedGender && ['Męskie', 'Damskie'].includes(wantedGender)) {
    state.gender = wantedGender;
    const gr = document.querySelector(`input[name="gender"][value="${wantedGender}"]`);
    if (gr) gr.checked = true;
  }

  // Free-text search coming from the search overlay (sklep.html?q=…).
  const wantedQ = (params.get('q') || '').trim();
  if (wantedQ) {
    state.q = wantedQ.toLowerCase();
    const bar = document.querySelector('.count-txt');
    if (bar) bar.insertAdjacentHTML('afterend',
      `<span class="search-tag" style="margin-left:12px;color:var(--grey-2);font-size:13px">Wyniki dla: <strong style="color:#fff">${wantedQ.replace(/[<>&]/g, '')}</strong></span>`);
  }

  function matchQuery(p) {
    if (!state.q) return true;
    return `${p.name || ''} ${p.brand || ''} ${p.cat || ''} ${p.level || ''} ${p.surface || ''}`
      .toLowerCase().includes(state.q);
  }

  // A product matches the gender filter if it is that gender or Unisex.
  function matchGender(p) {
    if (state.gender === 'Wszystkie') return true;
    const g = p.gender || 'Unisex';
    return g === state.gender || g === 'Unisex';
  }

  function currentList() {
    let list = PRODUCTS.filter(p =>
      (state.cat === 'Wszystkie' || p.cat === state.cat) &&
      matchGender(p) &&
      (state.brand === 'Wszystkie' || p.brand === state.brand) &&
      (!state.conditions.size || state.conditions.has(p.condition)) &&
      (!state.sizes.size || p.sizes.some(s => state.sizes.has(s))) &&
      (!state.levels.size || state.levels.has(p.level)) &&
      (!state.surfaces.size || state.surfaces.has(p.surface)) &&
      matchQuery(p) &&
      (p.price >= state.priceMin && p.price <= state.priceMax)
    );
    if (state.sort === 'low')  list = [...list].sort((a, b) => a.price - b.price);
    if (state.sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }

  function draw() {
    const list = currentList();
    renderProducts(shopGrid, list);
    const ct = document.querySelector('.count-txt strong');
    if (ct) ct.textContent = list.length;
  }

  // Category chips (top row)
  document.querySelectorAll('.chip[data-cat]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.cat = chip.dataset.cat;
      const radio = document.querySelector(`input[name="cat"][value="${state.cat}"]`);
      if (radio) radio.checked = true;
      updateFootballFilters();
      draw();
    });
  });

  // Sidebar category radios
  document.querySelectorAll('input[name="cat"]').forEach(r => {
    r.addEventListener('change', () => {
      state.cat = r.value;
      document.querySelectorAll('.chip[data-cat]').forEach(c =>
        c.classList.toggle('active', c.dataset.cat === state.cat));
      updateFootballFilters();
      draw();
    });
  });

  // Gender radios (Wszystkie / Męskie / Damskie)
  document.querySelectorAll('input[name="gender"]').forEach(r => {
    r.addEventListener('change', () => { state.gender = r.value; draw(); });
  });

  // Brand chips (single active, like "Wszystkie")
  document.querySelectorAll('.chip[data-brand]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-brand]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.brand = chip.dataset.brand;
      draw();
    });
  });

  // Condition checkboxes
  document.querySelectorAll('input[data-cond]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.checked ? state.conditions.add(cb.dataset.cond) : state.conditions.delete(cb.dataset.cond);
      draw();
    });
  });

  // Size chips (multi toggle)
  document.querySelectorAll('.chip[data-size]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.classList.contains('active') ? state.sizes.add(chip.dataset.size) : state.sizes.delete(chip.dataset.size);
      draw();
    });
  });

  // Zaawansowanie (level) chips — multi toggle
  document.querySelectorAll('.chip[data-level]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.classList.contains('active') ? state.levels.add(chip.dataset.level) : state.levels.delete(chip.dataset.level);
      draw();
    });
  });

  // Przeznaczenie (surface) chips — multi toggle
  document.querySelectorAll('.chip[data-surface]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.classList.contains('active') ? state.surfaces.add(chip.dataset.surface) : state.surfaces.delete(chip.dataset.surface);
      draw();
    });
  });

  // The zaawansowanie/przeznaczenie groups only make sense for football boots.
  const footballGroups = document.querySelectorAll('[data-football-filter]');
  function updateFootballFilters() {
    const show = state.cat === 'Buty piłkarskie';
    footballGroups.forEach(g => { g.style.display = show ? '' : 'none'; });
    if (!show) {
      // Clear any active football-only selections when leaving the category.
      state.levels.clear(); state.surfaces.clear();
      document.querySelectorAll('.chip[data-level],.chip[data-surface]').forEach(c => c.classList.remove('active'));
    }
  }

  // Price: dual-range slider synced with od/do number inputs
  const minInput = document.querySelector('#price-min');
  const maxInput = document.querySelector('#price-max');
  const minNum   = document.querySelector('#price-min-num');
  const maxNum   = document.querySelector('#price-max-num');
  const rangeBar = document.querySelector('#price-range');
  const SLIDER_MAX = 2000;

  function applyPrice(lo, hi, source) {
    lo = Math.max(0, Math.min(SLIDER_MAX, lo || 0));
    hi = Math.max(0, Math.min(SLIDER_MAX, hi || 0));
    if (lo > hi) { // keep order depending on which one moved
      if (source === 'min') hi = lo; else lo = hi;
    }
    state.priceMin = lo;
    state.priceMax = hi;
    if (minInput) minInput.value = lo;
    if (maxInput) maxInput.value = hi;
    if (minNum) minNum.value = lo;
    if (maxNum) maxNum.value = hi;
    if (rangeBar) {
      rangeBar.style.left = (lo / SLIDER_MAX * 100) + '%';
      rangeBar.style.right = (100 - hi / SLIDER_MAX * 100) + '%';
    }
    draw();
  }

  if (minInput && maxInput) {
    minInput.addEventListener('input', () => applyPrice(+minInput.value, +maxInput.value, 'min'));
    maxInput.addEventListener('input', () => applyPrice(+minInput.value, +maxInput.value, 'max'));
  }
  if (minNum && maxNum) {
    minNum.addEventListener('change', () => applyPrice(+minNum.value, +maxNum.value, 'min'));
    maxNum.addEventListener('change', () => applyPrice(+minNum.value, +maxNum.value, 'max'));
  }
  applyPrice(0, SLIDER_MAX);

  // Sort
  document.querySelector('#sort')?.addEventListener('change', (e) => {
    state.sort = e.target.value;
    draw();
  });

  // Reset
  document.querySelector('#filter-reset')?.addEventListener('click', () => {
    state.cat = 'Wszystkie'; state.brand = 'Wszystkie'; state.gender = 'Wszystkie';
    state.conditions.clear(); state.sizes.clear(); state.levels.clear(); state.surfaces.clear();
    state.q = ''; document.querySelector('.search-tag')?.remove();
    state.sort = 'default';

    document.querySelectorAll('.filters input[type="checkbox"]').forEach(c => c.checked = false);
    const allRadio = document.querySelector('input[name="cat"][value="Wszystkie"]');
    if (allRadio) allRadio.checked = true;
    const allGender = document.querySelector('input[name="gender"][value="Wszystkie"]');
    if (allGender) allGender.checked = true;
    const sortSel = document.querySelector('#sort'); if (sortSel) sortSel.value = 'default';

    document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.toggle('active', c.dataset.cat === 'Wszystkie'));
    document.querySelectorAll('.chip[data-brand]').forEach(c => c.classList.toggle('active', c.dataset.brand === 'Wszystkie'));
    document.querySelectorAll('.chip[data-size],.chip[data-level],.chip[data-surface]').forEach(c => c.classList.remove('active'));

    updateFootballFilters();
    applyPrice(0, SLIDER_MAX);
  });

  updateFootballFilters();
  draw();
}

/* ---------- Bootstrap ---------- */
(async function boot() {
  PRODUCTS = await loadProducts();
  renderFeatured();
  renderRelated();
  fillCategoryCounts();
  initShop();
})();
