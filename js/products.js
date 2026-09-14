/* ============================================
   FBT OUTLET — Product catalog + card renderer
   Products load from /api/products (Vercel Postgres).
   If the API is unavailable (e.g. opened as a static
   file), the embedded FALLBACK_PRODUCTS are used.
   Categories come from js/categories.js (CATEGORY_TREE).
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
  { id: 'p09', name: 'Piłka meczowa Pro',       cat: 'Akcesoria piłkarskie', brand: 'Adidas',      condition: 'Nowy', level: '',                 surface: '',                                 price: 159, old: 219, tag: '-27%',   tagType: 'sale', stars: 5, sizes: ['4','5'], colors: [], gradient: 'linear-gradient(135deg,#1c1c22,#320810)' },
  { id: 'p10', name: 'Piłka treningowa Club',   cat: 'Akcesoria piłkarskie', brand: 'Nike',        condition: 'Nowy', level: '',                 surface: '',                                 price: 89,  old: 129, tag: 'HIT',    tagType: 'hit',  stars: 4, sizes: ['4','5'], colors: [], gradient: 'linear-gradient(135deg,#151519,#2a0409)' },
  { id: 'p11', name: 'Buty sportowe RunFlex',   cat: 'Buty sportowe',        brand: 'New Balance', condition: 'Nowy', level: '',                 surface: '',                                 price: 289, old: 399, tag: '-27%',   tagType: 'sale', stars: 5, sizes: ['40','41','42','43','44'], colors: [], gradient: 'linear-gradient(135deg,#2a0409,#0f0f12)' },
  { id: 'p12', name: 'Ochraniacze Guard Pro',   cat: 'Akcesoria piłkarskie', brand: 'Puma',        condition: 'Nowy', level: '',                 surface: '',                                 price: 59,  old: 89,  tag: 'NOWOŚĆ', tagType: 'new',  stars: 5, sizes: ['S','M','L'], colors: [], gradient: 'linear-gradient(135deg,#1c1c22,#2a0409)' },
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
  // Admin-picked bestsellers first; if none are flagged, fall back to the first 8.
  const picked = PRODUCTS.filter((p) => p.featured);
  renderProducts('#featured-products', (picked.length ? picked : PRODUCTS).slice(0, 8));
}

// Polish plural for "produkt": 1 produkt, 2–4 produkty, else produktów.
function plProdukty(n) {
  if (n === 1) return 'produkt';
  const d = n % 10, h = n % 100;
  return (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) ? 'produkty' : 'produktów';
}

// Homepage category tiles: data-cat may be a leaf OR a main category name.
function fillCategoryCounts() {
  const mainOf = window.mainCategoryOf || (() => '');
  document.querySelectorAll('.cat-count[data-cat]').forEach((el) => {
    const key = el.dataset.cat;
    const n = PRODUCTS.filter((p) => p.cat === key || mainOf(p.cat) === key).length;
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
   Rozmiary — łatwe do edycji siatki (dodaj/zmień tutaj).
   ============================================ */
const SHOE_SIZES = [
  '35', '35,5',
  '36', '36,5', '36 2/3',
  '37', '37 1/3', '37,5',
  '38', '38,5', '38 2/3',
  '39', '39 1/3', '39,5',
  '40', '40,5', '40 2/3',
  '41', '41 1/3', '41,5',
  '42', '42,5', '42 2/3',
  '43', '43 1/3', '43,5',
  '44', '44,5', '44 2/3',
  '45', '45 1/3', '45,5',
  '46', '46,5', '46 2/3',
  '47', '47 1/3', '47,5',
  '48', '48,5', '48 2/3',
];
const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/* ============================================
   SHOP PAGE — filtering + sorting engine (tree-driven)
   ============================================ */
function initShop() {
  const shopGrid = '#shop-products';
  if (!document.querySelector(shopGrid)) return;

  const TREE = window.CATEGORY_TREE || [];
  const LEAVES = window.CATEGORY_LEAVES || [];
  const mainOf = window.mainCategoryOf || (() => '');
  const FOOTWEAR = window.FOOTWEAR_MAIN || ['Obuwie', 'Piłka nożna'];

  const state = {
    cat: '',        // wybrana podkategoria (liść); '' = brak
    main: '',       // wybrana kategoria główna; '' = brak
    gender: 'Wszystkie',
    brand: 'Wszystkie',
    conditions: new Set(),
    sizes: new Set(),
    levels: new Set(),
    surfaces: new Set(),
    q: '',
    priceMin: 0,
    priceMax: 2000,
    sort: 'default',
  };

  // ---- URL params (sklep.html?cat=… | ?main=… | ?gender=… | ?q=…) ----
  const params = new URLSearchParams(location.search);
  const wantedCat = params.get('cat');
  const wantedMain = params.get('main');
  if (wantedCat && LEAVES.includes(wantedCat)) state.cat = wantedCat;
  else if (wantedMain && TREE.some((g) => g.name === wantedMain)) state.main = wantedMain;

  const wantedGender = params.get('gender');
  if (wantedGender && ['Męskie', 'Damskie'].includes(wantedGender)) {
    state.gender = wantedGender;
    const gr = document.querySelector(`input[name="gender"][value="${wantedGender}"]`);
    if (gr) gr.checked = true;
  }

  const wantedQ = (params.get('q') || '').trim();
  if (wantedQ) {
    state.q = wantedQ.toLowerCase();
    const bar = document.querySelector('.count-txt');
    if (bar) bar.insertAdjacentHTML('afterend',
      `<span class="search-tag" style="margin-left:12px;color:var(--grey-2);font-size:13px">Wyniki dla: <strong style="color:#fff">${wantedQ.replace(/[<>&]/g, '')}</strong></span>`);
  }

  const selectedMain = () => (state.cat ? mainOf(state.cat) : state.main);

  // ---- Filtering ----
  function matchQuery(p) {
    if (!state.q) return true;
    return `${p.name || ''} ${p.brand || ''} ${p.cat || ''} ${p.level || ''} ${p.surface || ''}`
      .toLowerCase().includes(state.q);
  }
  function matchGender(p) {
    if (state.gender === 'Wszystkie') return true;
    const g = p.gender || 'Unisex';
    return g === state.gender || g === 'Unisex';
  }
  function matchCategory(p) {
    if (state.cat) return p.cat === state.cat;
    if (state.main) return mainOf(p.cat) === state.main;
    return true;
  }
  function currentList() {
    let list = PRODUCTS.filter((p) =>
      matchCategory(p) &&
      matchGender(p) &&
      (state.brand === 'Wszystkie' || p.brand === state.brand) &&
      (!state.conditions.size || state.conditions.has(p.condition)) &&
      (!state.sizes.size || (p.sizes || []).some((s) => state.sizes.has(s))) &&
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

  // ---- Category accordion (built from the tree) ----
  function buildCatAccordion() {
    const box = document.querySelector('#cat-accordion');
    if (!box) return;
    let html = `<button type="button" class="cacc-all" data-all>Wszystkie produkty</button>`;
    TREE.forEach((g) => {
      html += `<div class="cacc-group" data-main="${g.name}">
        <button type="button" class="cacc-head"><span>${g.name}</span><span class="cacc-caret"></span></button>
        <div class="cacc-list">
          <button type="button" class="cacc-sub cacc-mainall" data-main-all="${g.name}">Wszystko z: ${g.name}</button>
          ${g.subs.map((s) => `<button type="button" class="cacc-sub" data-cat="${s}">${s}</button>`).join('')}
        </div>
      </div>`;
    });
    box.innerHTML = html;
    box.querySelector('[data-all]').addEventListener('click', () => selectCategory({}));
    box.querySelectorAll('.cacc-head').forEach((h) =>
      h.addEventListener('click', () => h.closest('.cacc-group').classList.toggle('open')));
    box.querySelectorAll('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => selectCategory({ cat: b.dataset.cat })));
    box.querySelectorAll('[data-main-all]').forEach((b) =>
      b.addEventListener('click', () => selectCategory({ main: b.dataset.mainAll })));
    refreshCatUI();
  }
  function refreshCatUI() {
    const box = document.querySelector('#cat-accordion');
    if (!box) return;
    box.querySelector('[data-all]').classList.toggle('active', !state.cat && !state.main);
    box.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('active', b.dataset.cat === state.cat));
    box.querySelectorAll('[data-main-all]').forEach((b) => b.classList.toggle('active', b.dataset.mainAll === state.main));
    box.querySelectorAll('.cacc-group').forEach((g) => {
      if (g.dataset.main === selectedMain()) g.classList.add('open');
    });
  }
  function selectCategory({ cat = '', main = '' }) {
    state.cat = cat; state.main = main;
    refreshCatUI();
    updateFootballFilters();
    updateSizeGroups();
    draw();
  }

  // ---- Size chips (generated from config) ----
  function fillSizeChips() {
    const shoe = document.querySelector('[data-size-group="shoe"] .chip-row');
    const app  = document.querySelector('[data-size-group="apparel"] .chip-row');
    if (shoe) shoe.innerHTML = SHOE_SIZES.map((s) => `<span class="chip" data-size="${s}">${s}</span>`).join('');
    if (app)  app.innerHTML  = APPAREL_SIZES.map((s) => `<span class="chip" data-size="${s}">${s}</span>`).join('');
    document.querySelectorAll('.chip[data-size]').forEach((chip) => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        chip.classList.contains('active') ? state.sizes.add(chip.dataset.size) : state.sizes.delete(chip.dataset.size);
        draw();
      });
    });
  }
  const shoeSizeGroup    = document.querySelector('[data-size-group="shoe"]');
  const apparelSizeGroup = document.querySelector('[data-size-group="apparel"]');
  function toggleSizeGroup(el, show) {
    if (!el) return;
    el.style.display = show ? '' : 'none';
    if (!show) el.querySelectorAll('.chip[data-size]').forEach((c) => { c.classList.remove('active'); state.sizes.delete(c.dataset.size); });
  }
  function updateSizeGroups() {
    const m = selectedMain();
    const all = !state.cat && !state.main;
    toggleSizeGroup(shoeSizeGroup, all || FOOTWEAR.includes(m));
    toggleSizeGroup(apparelSizeGroup, all || m === 'Odzież');
  }

  // ---- Zaawansowanie / Przeznaczenie (tylko buty piłkarskie) ----
  const footballGroups = document.querySelectorAll('[data-football-filter]');
  function updateFootballFilters() {
    const show = state.cat === 'Buty piłkarskie';
    footballGroups.forEach((g) => { g.style.display = show ? '' : 'none'; });
    if (!show) {
      state.levels.clear(); state.surfaces.clear();
      document.querySelectorAll('.chip[data-level],.chip[data-surface]').forEach((c) => c.classList.remove('active'));
    }
  }
  document.querySelectorAll('.chip[data-level]').forEach((chip) => chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    chip.classList.contains('active') ? state.levels.add(chip.dataset.level) : state.levels.delete(chip.dataset.level);
    draw();
  }));
  document.querySelectorAll('.chip[data-surface]').forEach((chip) => chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    chip.classList.contains('active') ? state.surfaces.add(chip.dataset.surface) : state.surfaces.delete(chip.dataset.surface);
    draw();
  }));

  // ---- Gender / Brand / Condition ----
  document.querySelectorAll('input[name="gender"]').forEach((r) =>
    r.addEventListener('change', () => { state.gender = r.value; draw(); }));
  document.querySelectorAll('.chip[data-brand]').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-brand]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.brand = chip.dataset.brand;
    draw();
  }));
  document.querySelectorAll('input[data-cond]').forEach((cb) => cb.addEventListener('change', () => {
    cb.checked ? state.conditions.add(cb.dataset.cond) : state.conditions.delete(cb.dataset.cond);
    draw();
  }));

  // ---- Price ----
  const minInput = document.querySelector('#price-min');
  const maxInput = document.querySelector('#price-max');
  const minNum   = document.querySelector('#price-min-num');
  const maxNum   = document.querySelector('#price-max-num');
  const rangeBar = document.querySelector('#price-range');
  const SLIDER_MAX = 2000;
  function applyPrice(lo, hi, source) {
    lo = Math.max(0, Math.min(SLIDER_MAX, lo || 0));
    hi = Math.max(0, Math.min(SLIDER_MAX, hi || 0));
    if (lo > hi) { if (source === 'min') hi = lo; else lo = hi; }
    state.priceMin = lo; state.priceMax = hi;
    if (minInput) minInput.value = lo;
    if (maxInput) maxInput.value = hi;
    if (minNum) minNum.value = lo;
    if (maxNum) maxNum.value = hi;
    if (rangeBar) { rangeBar.style.left = (lo / SLIDER_MAX * 100) + '%'; rangeBar.style.right = (100 - hi / SLIDER_MAX * 100) + '%'; }
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

  // ---- Sort ----
  document.querySelector('#sort')?.addEventListener('change', (e) => { state.sort = e.target.value; draw(); });

  // ---- Reset ----
  document.querySelector('#filter-reset')?.addEventListener('click', () => {
    state.cat = ''; state.main = ''; state.brand = 'Wszystkie'; state.gender = 'Wszystkie';
    state.conditions.clear(); state.sizes.clear(); state.levels.clear(); state.surfaces.clear();
    state.q = ''; document.querySelector('.search-tag')?.remove();
    state.sort = 'default';

    document.querySelectorAll('.filters input[type="checkbox"]').forEach((c) => (c.checked = false));
    const allGender = document.querySelector('input[name="gender"][value="Wszystkie"]');
    if (allGender) allGender.checked = true;
    const sortSel = document.querySelector('#sort'); if (sortSel) sortSel.value = 'default';
    document.querySelectorAll('.chip[data-brand]').forEach((c) => c.classList.toggle('active', c.dataset.brand === 'Wszystkie'));
    document.querySelectorAll('.chip[data-size],.chip[data-level],.chip[data-surface]').forEach((c) => c.classList.remove('active'));
    document.querySelectorAll('.cacc-group').forEach((g) => g.classList.remove('open'));

    refreshCatUI();
    updateFootballFilters();
    updateSizeGroups();
    applyPrice(0, SLIDER_MAX);
  });

  // ---- Init ----
  buildCatAccordion();
  fillSizeChips();
  updateFootballFilters();
  updateSizeGroups();
  applyPrice(0, SLIDER_MAX);
}

/* ---------- Bootstrap ---------- */
(async function boot() {
  PRODUCTS = await loadProducts();
  renderFeatured();
  renderRelated();
  fillCategoryCounts();
  initShop();
})();
