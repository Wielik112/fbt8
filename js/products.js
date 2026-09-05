/* ============================================
   FBT OUTLET — Product catalog + card renderer
   Products load from /api/products (Vercel Postgres).
   If the API is unavailable (e.g. opened as a static
   file), the embedded FALLBACK_PRODUCTS are used.
   ============================================ */

const FALLBACK_PRODUCTS = [
  { id: 'p01', name: 'Velocity Pro Tee',   cat: 'Koszulki',  brand: 'Nike',       condition: 'Nowy',    price: 89,  old: 149, tag: '-40%',   tagType: 'sale', stars: 5, sizes: ['S','M','L','XL'], colors: ['Czarny','Czerwony'], gradient: 'linear-gradient(135deg,#2a0409,#1c1c22)' },
  { id: 'p02', name: 'Apex Track Jacket',  cat: 'Bluzy',     brand: 'Adidas',     condition: 'Nowy',    price: 259, old: 399, tag: 'HIT',    tagType: 'hit',  stars: 5, sizes: ['M','L','XL','XXL'], colors: ['Czarny','Szary'], gradient: 'linear-gradient(135deg,#1c1c22,#320810)' },
  { id: 'p03', name: 'Redline Joggers',    cat: 'Spodnie',   brand: 'Puma',       condition: 'Używany', price: 179, old: 249, tag: '-28%',   tagType: 'sale', stars: 4, sizes: ['S','M','L'], colors: ['Szary','Czarny'], gradient: 'linear-gradient(135deg,#151519,#2a0409)' },
  { id: 'p04', name: 'Surge Windbreaker',  cat: 'Kurtki',    brand: 'Nike',       condition: 'Nowy',    price: 329, old: 449, tag: 'NOWOŚĆ', tagType: 'new',  stars: 5, sizes: ['M','L','XL'], colors: ['Czarny','Czerwony'], gradient: 'linear-gradient(135deg,#2a0409,#0f0f12)' },
  { id: 'p05', name: 'Boost Runner GT',    cat: 'Obuwie',    brand: 'Adidas',     condition: 'Nowy',    price: 419, old: 599, tag: '-30%',   tagType: 'sale', stars: 5, sizes: ['M','L','XL','XXL'], colors: ['Czarny','Biały'], gradient: 'linear-gradient(135deg,#1c1c22,#2a0409)' },
  { id: 'p06', name: 'Torque Cap',         cat: 'Akcesoria', brand: 'New Balance',condition: 'Nowy',    price: 69,  old: 99,  tag: 'HIT',    tagType: 'hit',  stars: 4, sizes: ['M','L'], colors: ['Czarny','Czerwony'], gradient: 'linear-gradient(135deg,#320810,#151519)' },
  { id: 'p07', name: 'Nitro Compression',  cat: 'Koszulki',  brand: 'Under Armour',condition:'Nowy',    price: 119, old: 169, tag: '-29%',   tagType: 'sale', stars: 5, sizes: ['XS','S','M','L'], colors: ['Czerwony','Czarny'], gradient: 'linear-gradient(135deg,#0f0f12,#2a0409)' },
  { id: 'p08', name: 'Drift Cargo Pants',  cat: 'Spodnie',   brand: 'Puma',       condition: 'Używany', price: 219, old: 299, tag: 'NOWOŚĆ', tagType: 'new',  stars: 4, sizes: ['S','M','L','XL'], colors: ['Szary','Czarny'], gradient: 'linear-gradient(135deg,#2a0409,#1c1c22)' },
  { id: 'p09', name: 'Ignite Hoodie',      cat: 'Bluzy',     brand: 'Nike',       condition: 'Nowy',    price: 199, old: 279, tag: '-28%',   tagType: 'sale', stars: 5, sizes: ['M','L','XL','XXL'], colors: ['Czarny','Czerwony'], gradient: 'linear-gradient(135deg,#1c1c22,#320810)' },
  { id: 'p10', name: 'Sprint Shorts 2.0',  cat: 'Spodnie',   brand: 'Reebok',     condition: 'Używany', price: 99,  old: 139, tag: 'HIT',    tagType: 'hit',  stars: 4, sizes: ['XS','S','M','L'], colors: ['Czarny','Biały'], gradient: 'linear-gradient(135deg,#151519,#2a0409)' },
  { id: 'p11', name: 'Carbon Duffel Bag',  cat: 'Akcesoria', brand: 'Adidas',     condition: 'Nowy',    price: 289, old: 399, tag: '-27%',   tagType: 'sale', stars: 5, sizes: ['M','L'], colors: ['Czarny','Szary'], gradient: 'linear-gradient(135deg,#2a0409,#0f0f12)' },
  { id: 'p12', name: 'Phantom Trail Shoe', cat: 'Obuwie',    brand: 'New Balance',condition: 'Używany', price: 379, old: 529, tag: 'NOWOŚĆ', tagType: 'new',  stars: 5, sizes: ['M','L','XL'], colors: ['Czarny','Biały'], gradient: 'linear-gradient(135deg,#1c1c22,#2a0409)' },
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

// Original seeded products (ids p01..p12) have hand-crafted static pages;
// everything else uses the dynamic template produkt.html?id=<id>.
function productHref(p) {
  return /^p\d{2}$/.test(p.id) ? `produkt-${p.id}.html` : `produkt.html?id=${encodeURIComponent(p.id)}`;
}

function productCard(p) {
  const condClass = p.condition === 'Nowy' ? 'cond-new' : 'cond-used';
  const oldPrice = p.old ? ` <span class="old">${p.old} zł</span>` : '';
  const href = productHref(p);
  const bg = p.gradient ? ` style="background:${p.gradient}"` : '';
  const media = p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy">` : '';
  return `
  <article class="product-card reveal" data-product="${p.id}" data-name="${p.name}" data-price="${p.price}">
    <div class="product-media"${bg}>
      ${media}
      <div class="product-badges">
        ${p.tag ? `<span class="tag ${p.tagType === 'sale' ? '' : 'grey'}">${p.tag}</span>` : ''}
        <span class="tag ${condClass}">${p.condition}</span>
      </div>
      <a href="${href}" class="product-quick">Zobacz produkt</a>
    </div>
    <div class="product-info">
      <div class="product-cat">${p.brand} · ${p.cat}</div>
      <h3 class="product-name"><a href="${href}">${p.name}</a></h3>
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
    brand: 'Wszystkie',     // single active brand chip
    conditions: new Set(),  // empty = all
    sizes: new Set(),       // empty = all
    colors: new Set(),      // empty = all
    priceMin: 0,
    priceMax: 600,
    sort: 'default',
  };

  function currentList() {
    let list = PRODUCTS.filter(p =>
      (state.cat === 'Wszystkie' || p.cat === state.cat) &&
      (state.brand === 'Wszystkie' || p.brand === state.brand) &&
      (!state.conditions.size || state.conditions.has(p.condition)) &&
      (!state.sizes.size || p.sizes.some(s => state.sizes.has(s))) &&
      (!state.colors.size || p.colors.some(c => state.colors.has(c))) &&
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
      draw();
    });
  });

  // Sidebar category radios
  document.querySelectorAll('input[name="cat"]').forEach(r => {
    r.addEventListener('change', () => {
      state.cat = r.value;
      document.querySelectorAll('.chip[data-cat]').forEach(c =>
        c.classList.toggle('active', c.dataset.cat === state.cat));
      draw();
    });
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

  // Color chips (multi toggle)
  document.querySelectorAll('.chip[data-color]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.classList.contains('active') ? state.colors.add(chip.dataset.color) : state.colors.delete(chip.dataset.color);
      draw();
    });
  });

  // Price: dual-range slider synced with od/do number inputs
  const minInput = document.querySelector('#price-min');
  const maxInput = document.querySelector('#price-max');
  const minNum   = document.querySelector('#price-min-num');
  const maxNum   = document.querySelector('#price-max-num');
  const rangeBar = document.querySelector('#price-range');
  const SLIDER_MAX = 600;

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
    state.cat = 'Wszystkie'; state.brand = 'Wszystkie';
    state.conditions.clear(); state.sizes.clear(); state.colors.clear();
    state.sort = 'default';

    document.querySelectorAll('.filters input[type="checkbox"]').forEach(c => c.checked = false);
    const allRadio = document.querySelector('input[name="cat"][value="Wszystkie"]');
    if (allRadio) allRadio.checked = true;
    const sortSel = document.querySelector('#sort'); if (sortSel) sortSel.value = 'default';

    document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.toggle('active', c.dataset.cat === 'Wszystkie'));
    document.querySelectorAll('.chip[data-brand]').forEach(c => c.classList.toggle('active', c.dataset.brand === 'Wszystkie'));
    document.querySelectorAll('.chip[data-size],.chip[data-color]').forEach(c => c.classList.remove('active'));

    applyPrice(0, SLIDER_MAX);
  });

  draw();
}

/* ---------- Bootstrap ---------- */
(async function boot() {
  PRODUCTS = await loadProducts();
  renderFeatured();
  renderRelated();
  initShop();
})();
