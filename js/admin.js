/* ============================================
   FBT OUTLET — Admin panel logic
   Talks to /api/login and /api/products.
   Auth uses an HttpOnly session cookie; a bearer
   token is also kept as a same-origin fallback.
   ============================================ */

const CATEGORY_TREE = window.CATEGORY_TREE || [
  { name: 'Obuwie', subs: ['Buty', 'Buty sportowe', 'Trampki'] },
  { name: 'Odzież', subs: ['Koszulki', 'Kurtki', 'Bluzy', 'Spodnie', 'Dresy sportowe', 'Czapki'] },
  { name: 'Piłka nożna', subs: ['Buty piłkarskie', 'Rękawice bramkarskie', 'Akcesoria piłkarskie'] },
];
const CATEGORIES = window.CATEGORY_LEAVES || CATEGORY_TREE.flatMap((g) => g.subs);
const mainCategoryOf = window.mainCategoryOf || ((leaf) => (CATEGORY_TREE.find((g) => g.subs.includes(leaf)) || {}).name || '');
const CONDITIONS = ['Nowy'];
const GENDERS = ['Męskie', 'Damskie', 'Unisex'];
const LEVELS = ['Rekreacyjne', 'Treningowe', 'Półprofesjonalne', 'Profesjonalne'];
const SURFACES = ['Na trawę (lanki)', 'Na sztuczną trawę/orlika (turfy)', 'Na mokrą trawę (wkręty/mixy)', 'Na halę (halówki)'];
const GARMENTS = ['Kurtki', 'Bluzy', 'Spodnie', 'Dresy sportowe', 'Czapki'];
const TOKEN_KEY = 'fbt_admin_token';
const DEFAULT_GRADIENT = 'linear-gradient(135deg,#2a0409,#1c1c22)';

const $ = (id) => document.getElementById(id);
const views = { login: $('login-view'), panel: $('panel-view') };

let products = [];

/* ---------- Product photos (in-modal state) ---------- */
const MAX_GALLERY = 8;
let mainImage = '';       // data URL of the main photo (or '')
let galleryImages = [];   // data URLs of extra gallery photos

// Reads an image file, downscales it and returns a compact JPEG data URL.
// Downscaling keeps request payloads well under the serverless body limit.
function fileToScaledDataURL(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) { reject(new Error('Wybierz plik graficzny.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nie udało się wczytać pliku.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Nie udało się otworzyć obrazu.'));
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxDim || h > maxDim) {
          const s = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Fetch helper ---------- */
function authHeaders(extra = {}) {
  const h = { ...extra };
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: authHeaders(), credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Błąd (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- View switching ---------- */
function show(view) {
  views.login.classList.toggle('hidden', view !== 'login');
  views.panel.classList.toggle('hidden', view !== 'panel');
  $('logout-btn').classList.toggle('hidden', view !== 'panel');
}

function notice(el, msg, kind) {
  if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.className = `notice ${kind === 'ok' ? 'notice-ok' : 'notice-err'}`;
  el.textContent = msg;
}

function panelNotice(msg, kind) {
  const box = $('panel-notice');
  box.innerHTML = '';
  if (!msg) return;
  const div = document.createElement('div');
  div.className = `notice ${kind === 'ok' ? 'notice-ok' : 'notice-err'}`;
  div.textContent = msg;
  box.appendChild(div);
  if (kind === 'ok') setTimeout(() => { if (box.contains(div)) box.removeChild(div); }, 3500);
}

/* ---------- Auth ---------- */
async function checkSession() {
  try {
    const { authed } = await api('/api/login');
    return !!authed;
  } catch { return false; }
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  notice($('login-error'), '', 'err');
  const btn = $('login-btn');
  btn.disabled = true;
  try {
    const data = await api('/api/login', { method: 'POST', body: { password: $('password').value } });
    if (data?.token) localStorage.setItem(TOKEN_KEY, data.token);
    $('password').value = '';
    await enterPanel();
  } catch (err) {
    notice($('login-error'), err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

$('logout-btn').addEventListener('click', async () => {
  try { await api('/api/login', { method: 'DELETE' }); } catch { /* ignore */ }
  localStorage.removeItem(TOKEN_KEY);
  show('login');
});

/* ---------- Product list rendering ---------- */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let productFilter = 'Wszystkie';
let productSearch = '';

function filteredProducts() {
  const q = productSearch.trim().toLowerCase();
  return products.filter((p) => {
    if (productFilter !== 'Wszystkie' && mainCategoryOf(p.cat) !== productFilter && p.cat !== productFilter) return false;
    if (!q) return true;
    return `${p.name || ''} ${p.brand || ''} ${p.id || ''}`.toLowerCase().includes(q);
  });
}

// Category filter chips (built once) — mirrors the shop categories.
function renderProductFilters() {
  const box = $('prod-filters');
  if (!box || box.dataset.built) return;
  box.dataset.built = '1';
  const cats = ['Wszystkie', ...CATEGORY_TREE.map((g) => g.name)];
  box.innerHTML = cats.map((c) =>
    `<button type="button" class="pchip${c === productFilter ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.pchip');
    if (!btn) return;
    productFilter = btn.dataset.cat;
    box.querySelectorAll('.pchip').forEach((b) => b.classList.toggle('active', b === btn));
    renderRows();
  });
  const search = $('prod-search');
  if (search) search.addEventListener('input', () => { productSearch = search.value; renderRows(); });
}

function renderRows() {
  const tbody = $('rows');
  const list = filteredProducts();
  $('count').textContent = list.length === products.length ? products.length : `${list.length} / ${products.length}`;
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Brak produktów. Kliknij „Dodaj produkt”.</td></tr>';
    return;
  }
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Brak produktów dla wybranego filtra.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((p) => {
    const condClass = p.condition === 'Nowy' ? 'new' : 'used';
    const old = p.old ? `<span class="old">${esc(p.old)} zł</span>` : '';
    const media = p.image
      ? `<img class="thumb-img" src="${esc(p.image)}" alt="">`
      : `<div class="swatch" style="background:${esc(p.gradient || DEFAULT_GRADIENT)}"></div>`;
    const extra = [p.level, p.surface].filter(Boolean).map(esc).join(' · ');
    const noteFlag = (p.note && p.note.trim()) ? ' · 📝 uwagi' : '';
    const featFlag = p.featured ? ' · ⭐ Bestseller' : '';
    const stockVals = (p.stock && typeof p.stock === 'object') ? Object.values(p.stock) : [];
    const stockTotal = stockVals.reduce((a, b) => a + (Number(b) || 0), 0);
    const stockFlag = stockVals.length ? ` · 📦 ${stockTotal} szt.` : '';
    return `
    <tr data-id="${esc(p.id)}">
      <td class="cell-media">${media}</td>
      <td class="cell-title">
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${esc(p.brand)} · ${esc(p.gender || 'Unisex')} · ${esc(p.id)}${extra ? ' · ' + extra : ''}${stockFlag}${noteFlag}${featFlag}</div>
      </td>
      <td class="hide-sm" data-label="Kategoria">${esc(p.cat)}</td>
      <td class="hide-sm" data-label="Stan"><span class="pill ${condClass}">${esc(p.condition)} · Kat. A</span></td>
      <td data-label="Cena"><span class="price">${esc(p.price)} zł ${old}</span></td>
      <td class="cell-actions">
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-act="edit">Edytuj</button>
          <button class="btn btn-danger btn-sm" data-act="del">Usuń</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function loadProducts() {
  const tbody = $('rows');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Ładowanie…</td></tr>';
  try {
    products = await api('/api/products');
    renderRows();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">${esc(err.message)}</td></tr>`;
  }
}

async function enterPanel() {
  show('panel');
  // Default to the Products tab on every fresh entry.
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'products'));
  $('tab-products').hidden = false;
  $('tab-orders').hidden = true;
  $('tab-reviews').hidden = true;
  ordersState.loaded = false;
  reviewsLoaded = false;
  renderProductFilters();
  await loadProducts();
}

/* ---------- Row actions (delegated) ---------- */
$('rows').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr')?.dataset.id;
  const product = products.find((p) => p.id === id);
  if (!product) return;
  if (btn.dataset.act === 'edit') openModal(product);
  if (btn.dataset.act === 'del') removeProduct(product);
});

async function removeProduct(product) {
  if (!confirm(`Usunąć produkt „${product.name}”? Tej operacji nie można cofnąć.`)) return;
  try {
    await api(`/api/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
    products = products.filter((p) => p.id !== product.id);
    renderRows();
    panelNotice(`Usunięto „${product.name}”.`, 'ok');
  } catch (err) {
    panelNotice(err.message, 'err');
  }
}

/* ---------- Reviews (opinie) ---------- */
let reviews = [];
let reviewsLoaded = false;

function starStr(n) {
  n = Math.min(5, Math.max(1, Number(n) || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}
function reviewsNotice(msg, kind) {
  const box = $('reviews-notice');
  box.innerHTML = '';
  if (!msg) return;
  const div = document.createElement('div');
  div.className = `notice ${kind === 'ok' ? 'notice-ok' : 'notice-err'}`;
  div.textContent = msg;
  box.appendChild(div);
  if (kind === 'ok') setTimeout(() => { if (box.contains(div)) box.removeChild(div); }, 3500);
}

function renderReviews() {
  const tbody = $('rev-rows');
  $('rev-count').textContent = reviews.length;
  if (!reviews.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Brak opinii.</td></tr>';
    return;
  }
  tbody.innerHTML = reviews.map((r) => `
    <tr data-id="${esc(r.id)}">
      <td data-label="Ocena"><span class="rev-stars">${starStr(r.rating)}</span></td>
      <td class="cell-title"><div class="rev-body">${esc(r.body)}</div></td>
      <td class="hide-sm" data-label="Nr zam.">${esc(r.orderNo)}</td>
      <td class="hide-sm" data-label="Data">${esc(fmtDate(r.createdAt))}</td>
      <td class="cell-actions"><div class="row-actions"><button class="btn btn-danger btn-sm" data-act="del-rev">Usuń</button></div></td>
    </tr>`).join('');
}

async function loadReviews() {
  const tbody = $('rev-rows');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Ładowanie…</td></tr>';
  try {
    reviews = await api('/api/reviews');
    renderReviews();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${esc(err.message)}</td></tr>`;
  }
}

$('rev-rows').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act="del-rev"]');
  if (!btn) return;
  const id = btn.closest('tr')?.dataset.id;
  const review = reviews.find((r) => r.id === id);
  if (review) removeReview(review);
});

async function removeReview(review) {
  if (!confirm('Usunąć tę opinię? Tej operacji nie można cofnąć.')) return;
  try {
    await api(`/api/reviews/${encodeURIComponent(review.id)}`, { method: 'DELETE' });
    reviews = reviews.filter((r) => r.id !== review.id);
    renderReviews();
    reviewsNotice('Opinia usunięta.', 'ok');
  } catch (err) {
    reviewsNotice(err.message, 'err');
  }
}

/* ---------- Modal (add / edit) ---------- */
const modal = $('modal');

function fillSelect(sel, options, current) {
  sel.innerHTML = options.map((o) => `<option value="${esc(o)}"${o === current ? ' selected' : ''}>${esc(o) || '—'}</option>`).join('');
}
// Category select grouped by main category (Obuwie / Odzież / Piłka nożna).
function fillCatSelect(sel, current) {
  sel.innerHTML = CATEGORY_TREE.map((g) =>
    `<optgroup label="${esc(g.name)}">` +
    g.subs.map((s) => `<option value="${esc(s)}"${s === current ? ' selected' : ''}>${esc(s)}</option>`).join('') +
    `</optgroup>`).join('');
}

/* ---------- Stock editor (rozmiary do kliknięcia + ilości) ---------- */
const SIZE_SETS = window.SIZE_SETS || {};
const sizeSetFor = window.sizeSetFor || (() => 'apparel');

function getBasePrice() { const v = $('f-price').value.trim(); return v === '' ? '' : v; }
let lastBasePrice = '';
// Cena rozmiaru podpowiada się z ceny bazowej produktu; admin zmienia tylko te,
// które mają być inne. Przy zapisie zapisujemy WYŁĄCZNIE realne różnice.
function stockRowHtml(size, qty, price) {
  const qv = (qty === '' || qty == null) ? '' : esc(String(qty));
  const base = getBasePrice();
  const pv = (price === '' || price == null) ? esc(String(base)) : esc(String(price));
  return `<div class="stock-row" data-size="${esc(size)}">
    <span class="stk-size-label">${esc(size)}</span>
    <div class="stk-qty-wrap"><input class="stk-qty" type="number" min="0" step="1" value="${qv}" placeholder="∞"></div>
    <div class="stk-price-wrap"><input class="stk-price" type="number" min="0" step="1" value="${pv}" placeholder="${base !== '' ? esc(String(base)) : 'baza'}"></div>
    <button type="button" class="stk-rm" aria-label="Usuń rozmiar">×</button>
  </div>`;
}
// Gdy zmieni się cena bazowa, zaktualizuj rozmiary, których ceny nie ruszono.
function syncStockPricesToBase() {
  const nb = getBasePrice();
  document.querySelectorAll('#f-stock-rows .stk-price').forEach((inp) => {
    const cur = inp.value.trim();
    if (cur === '' || cur === lastBasePrice) inp.value = nb;
  });
  lastBasePrice = nb;
}
function stockEmptyHtml() { return '<div class="stock-empty">Nie wybrano rozmiarów — kliknij je powyżej.</div>'; }

function selectedSizes() {
  return [...$('f-stock-rows').querySelectorAll('.stock-row')].map((r) => r.dataset.size);
}
function syncPickerActive() {
  const sel = new Set(selectedSizes());
  $('f-size-picker').querySelectorAll('.sp-chip').forEach((c) => c.classList.toggle('active', sel.has(c.dataset.size)));
}
function ensureStockEmptyState() {
  const box = $('f-stock-rows');
  const hasRows = !!box.querySelector('.stock-row');
  const empty = box.querySelector('.stock-empty');
  if (hasRows && empty) empty.remove();
  if (!hasRows && !empty) box.innerHTML = stockEmptyHtml();
  const head = $('f-stock-head');
  if (head) head.hidden = !hasRows;
}
function addStockRow(size, qty, price) {
  const s = String(size).trim();
  if (!s) return;
  const box = $('f-stock-rows');
  if ([...box.querySelectorAll('.stock-row')].some((r) => r.dataset.size === s)) return; // już jest
  const empty = box.querySelector('.stock-empty');
  if (empty) empty.remove();
  box.insertAdjacentHTML('beforeend', stockRowHtml(s, qty == null ? 1 : qty, price == null ? '' : price));
}
function removeStockRow(size) {
  const row = [...$('f-stock-rows').querySelectorAll('.stock-row')].find((r) => r.dataset.size === size);
  if (row) row.remove();
  ensureStockEmptyState();
}

// Buduje klikalne chipy rozmiarów pasujące do wybranej kategorii.
function renderSizePicker(cat) {
  const set = SIZE_SETS[sizeSetFor(cat)] || [];
  $('f-size-picker').innerHTML = set.map((s) => `<span class="sp-chip" data-size="${esc(s)}">${esc(s)}</span>`).join('');
  syncPickerActive();
}

// Odtwarza wybrane rozmiary (z ilościami i cenami) przy otwieraniu produktu.
function renderStockRows(sizes, stock, prices) {
  const box = $('f-stock-rows');
  const rows = (sizes || []).map((s) => {
    const hasQ = stock && Object.prototype.hasOwnProperty.call(stock, s);
    const hasP = prices && Object.prototype.hasOwnProperty.call(prices, s);
    return stockRowHtml(s, hasQ ? stock[s] : '', hasP ? prices[s] : '');
  });
  box.innerHTML = rows.join('') || stockEmptyHtml();
  const head = $('f-stock-head');
  if (head) head.hidden = !(sizes && sizes.length);
}

// Zbiera rozmiary (kolejność) + mapę stanów { rozmiar: sztuki } + mapę cen.
// Puste pole ilości = bez limitu; puste pole ceny = cena bazowa produktu.
function readStockEditor() {
  const sizes = []; const stock = {}; const prices = {};
  const base = Number(getBasePrice());
  $('f-stock-rows').querySelectorAll('.stock-row').forEach((row) => {
    const size = row.dataset.size;
    if (!size || sizes.includes(size)) return;
    sizes.push(size);
    const qv = row.querySelector('.stk-qty').value.trim();
    if (qv !== '') stock[size] = Math.max(0, Math.round(Number(qv)) || 0);
    const pv = row.querySelector('.stk-price').value.trim();
    if (pv !== '') {
      const n = Math.max(0, Math.round(Number(pv)) || 0);
      // Zapisz jako nadpisanie tylko jeśli różni się od ceny bazowej.
      if (!Number.isFinite(base) || n !== base) prices[size] = n;
    }
  });
  return { sizes, stock, prices };
}

// Klik na chip = dodaj/usuń rozmiar z listy wybranych.
$('f-size-picker').addEventListener('click', (e) => {
  const chip = e.target.closest('.sp-chip');
  if (!chip) return;
  const size = chip.dataset.size;
  if ([...$('f-stock-rows').querySelectorAll('.stock-row')].some((r) => r.dataset.size === size)) removeStockRow(size);
  else { addStockRow(size, 1); }
  ensureStockEmptyState();
  syncPickerActive();
});
// Ręczne usuwanie wiersza.
$('f-stock-rows').addEventListener('click', (e) => {
  const rm = e.target.closest('.stk-rm');
  if (!rm) return;
  rm.closest('.stock-row').remove();
  ensureStockEmptyState();
  syncPickerActive();
});
// Rozmiar spoza listy (opcjonalnie).
$('f-stock-add').addEventListener('click', () => {
  const inp = $('f-stock-bulk');
  splitList(inp.value).forEach((s) => addStockRow(s, 1));
  inp.value = '';
  ensureStockEmptyState();
  syncPickerActive();
});
$('f-stock-bulk').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('f-stock-add').click(); }
});
// Zmiana kategorii → inne rozmiary do wyboru (wybrane pozostają).
$('f-cat').addEventListener('change', () => renderSizePicker($('f-cat').value));
// Zmiana ceny bazowej → podpowiedz ją przy nieruszanych rozmiarach.
$('f-price').addEventListener('input', syncStockPricesToBase);

/* ---------- Specs editor (cechy produktu) ---------- */
function specRowHtml(k, v) {
  return `<div class="spec-row">
    <input class="spec-k" type="text" value="${esc(k || '')}" placeholder="Cecha (np. Podeszwa)">
    <input class="spec-v" type="text" value="${esc(v || '')}" placeholder="Wartość (np. guma)">
    <button type="button" class="spec-rm" aria-label="Usuń cechę">×</button>
  </div>`;
}
function renderSpecs(specs) {
  const box = $('f-specs-rows');
  const list = Array.isArray(specs) ? specs : [];
  box.innerHTML = list.map((s) => specRowHtml(s.k ?? s.label, s.v ?? s.value)).join('');
  const head = $('f-specs-head');
  if (head) head.hidden = list.length === 0;
}
function addSpecRow(k, v) {
  $('f-specs-rows').insertAdjacentHTML('beforeend', specRowHtml(k || '', v || ''));
  const head = $('f-specs-head');
  if (head) head.hidden = false;
}
function readSpecs() {
  const out = [];
  $('f-specs-rows').querySelectorAll('.spec-row').forEach((row) => {
    const k = row.querySelector('.spec-k').value.trim();
    const v = row.querySelector('.spec-v').value.trim();
    if (k && v) out.push({ k, v });
  });
  return out;
}
$('f-spec-add').addEventListener('click', () => addSpecRow());
$('f-specs-rows').addEventListener('click', (e) => {
  const rm = e.target.closest('.spec-rm');
  if (!rm) return;
  rm.closest('.spec-row').remove();
  const head = $('f-specs-head');
  if (head && !$('f-specs-rows').querySelector('.spec-row')) head.hidden = true;
});

function openModal(product) {
  const editing = !!product;
  $('modal-title').textContent = editing ? 'Edytuj produkt' : 'Nowy produkt';
  notice($('form-error'), '', 'err');

  fillCatSelect($('f-cat'), product?.cat || CATEGORIES[0]);
  fillSelect($('f-condition'), CONDITIONS, product?.condition || CONDITIONS[0]);
  fillSelect($('f-gender'), GENDERS, product?.gender || 'Unisex');
  fillSelect($('f-level'), ['', ...LEVELS], product?.level || '');
  fillSelect($('f-surface'), ['', ...SURFACES], product?.surface || '');

  $('f-id').value        = product?.id || '';
  $('f-name').value      = product?.name || '';
  $('f-brand').value     = product?.brand || '';
  $('f-price').value     = product?.price ?? '';
  $('f-old').value       = product?.old ?? '';
  $('f-description').value = product?.description || '';
  $('f-note').value      = product?.note || '';
  $('f-featured').checked = product?.featured === true;
  $('f-tag').value       = product?.tag || '';
  $('f-tagType').value   = product?.tagType || 'sale';
  $('f-code').value      = product?.code || '';
  lastBasePrice = getBasePrice();
  renderSpecs(product?.specs || []);
  $('f-stock-bulk').value = '';
  renderStockRows(product?.sizes || [], product?.stock || {}, product?.prices || {});
  renderSizePicker(product?.cat || CATEGORIES[0]);

  mainImage = product?.image || '';
  galleryImages = Array.isArray(product?.images) ? [...product.images] : [];
  $('f-image-input').value = '';
  $('f-gallery-input').value = '';
  renderMainPreview();
  renderGalleryPreview();

  modal.classList.remove('hidden');
  $('f-name').focus();
}

function closeModal() { modal.classList.add('hidden'); }

/* ---------- Photo previews ---------- */
function renderMainPreview() {
  const box = $('main-preview');
  box.innerHTML = mainImage
    ? `<div class="img-thumb"><img src="${mainImage}" alt="">
         <button type="button" class="rm" data-rm-main aria-label="Usuń">×</button>
         <span class="main-badge">Główne</span></div>`
    : '';
}

function renderGalleryPreview() {
  const box = $('gallery-preview');
  box.innerHTML = galleryImages.map((src, i) =>
    `<div class="img-thumb"><img src="${src}" alt="">
       <button type="button" class="rm" data-rm-gallery="${i}" aria-label="Usuń">×</button></div>`).join('');
}

$('main-preview').addEventListener('click', (e) => {
  if (e.target.closest('[data-rm-main]')) { mainImage = ''; renderMainPreview(); }
});
$('gallery-preview').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-rm-gallery]');
  if (btn) { galleryImages.splice(Number(btn.dataset.rmGallery), 1); renderGalleryPreview(); }
});

$('f-image-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { mainImage = await fileToScaledDataURL(file); renderMainPreview(); notice($('form-error'), '', 'err'); }
  catch (err) { notice($('form-error'), err.message, 'err'); }
});

$('f-gallery-input').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) {
    if (galleryImages.length >= MAX_GALLERY) {
      notice($('form-error'), `Galeria może zawierać maksymalnie ${MAX_GALLERY} zdjęć.`, 'err');
      break;
    }
    try { galleryImages.push(await fileToScaledDataURL(file)); }
    catch (err) { notice($('form-error'), err.message, 'err'); }
  }
  renderGalleryPreview();
});

$('add-btn').addEventListener('click', () => openModal(null));
$('modal-close').addEventListener('click', closeModal);
$('cancel-btn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });

function splitList(v) {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

$('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  notice($('form-error'), '', 'err');
  const id = $('f-id').value.trim();
  const { sizes, stock, prices } = readStockEditor();
  const payload = {
    name: $('f-name').value.trim(),
    brand: $('f-brand').value.trim(),
    cat: $('f-cat').value,
    condition: $('f-condition').value,
    gender: $('f-gender').value,
    level: $('f-level').value,
    surface: $('f-surface').value,
    price: $('f-price').value,
    old: $('f-old').value,
    code: $('f-code').value.trim(),
    description: $('f-description').value.trim(),
    note: $('f-note').value.trim(),
    featured: $('f-featured').checked,
    tag: $('f-tag').value.trim(),
    tagType: $('f-tagType').value,
    sizes,
    stock,
    prices,
    specs: readSpecs(),
    image: mainImage,
    images: galleryImages,
  };

  const btn = $('save-btn');
  btn.disabled = true;
  try {
    if (id) {
      const updated = await api(`/api/products/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
      const idx = products.findIndex((p) => p.id === id);
      if (idx >= 0) products[idx] = updated;
      panelNotice(`Zapisano zmiany w „${updated.name}”.`, 'ok');
    } else {
      const created = await api('/api/products', { method: 'POST', body: payload });
      products.push(created);
      panelNotice(`Dodano „${created.name}”.`, 'ok');
    }
    renderRows();
    closeModal();
  } catch (err) {
    if (err.status === 401) {
      notice($('form-error'), 'Sesja wygasła. Zaloguj się ponownie.', 'err');
      setTimeout(() => { closeModal(); show('login'); }, 1200);
    } else {
      notice($('form-error'), err.message, 'err');
    }
  } finally {
    btn.disabled = false;
  }
});

/* ============================================
   ORDERS
   ============================================ */
const ORDER_STATUS_LABELS = {
  pending: 'Oczekuje', paid: 'Opłacone', fulfilled: 'W realizacji',
  shipped: 'Wysłane', completed: 'Zrealizowane', cancelled: 'Anulowane',
};
const PAYMENT_LABELS = {
  unpaid: 'Nieopłacone', processing: 'W trakcie', paid: 'Opłacone',
  failed: 'Nieudane', refunded: 'Zwrócone',
};
const fmtPLN = (gr) => (Number(gr || 0) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const fmtDateTime = (s) => { try { return new Date(s).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };

const ordersState = { status: '', offset: 0, limit: 25, total: 0, loaded: false };
let ordersCache = [];
let currentOrder = null;

// Tab switching (Produkty / Zamówienia / Opinie)
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    const name = tab.dataset.tab;
    $('tab-products').hidden = name !== 'products';
    $('tab-orders').hidden = name !== 'orders';
    $('tab-reviews').hidden = name !== 'reviews';
    if (name === 'orders' && !ordersState.loaded) loadOrders();
    if (name === 'reviews' && !reviewsLoaded) { reviewsLoaded = true; loadReviews(); }
  });
});

$('order-filter').addEventListener('change', () => { ordersState.status = $('order-filter').value; ordersState.offset = 0; loadOrders(); });
$('orders-refresh').addEventListener('click', () => loadOrders());

function ordersNotice(msg, kind) {
  const box = $('orders-notice');
  box.innerHTML = '';
  if (!msg) return;
  const d = document.createElement('div');
  d.className = 'notice ' + (kind === 'ok' ? 'notice-ok' : 'notice-err');
  d.textContent = msg;
  box.appendChild(d);
  if (kind === 'ok') setTimeout(() => { if (box.contains(d)) box.removeChild(d); }, 3500);
}

async function loadOrders() {
  const tbody = $('order-rows');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Ładowanie…</td></tr>';
  try {
    const q = new URLSearchParams();
    if (ordersState.status) q.set('status', ordersState.status);
    q.set('limit', ordersState.limit);
    q.set('offset', ordersState.offset);
    q.set('stats', '1');
    const data = await api('/api/orders/list?' + q.toString());
    ordersState.loaded = true;
    ordersState.total = data.total;
    ordersCache = data.orders;
    renderOrderStats(data.stats);
    renderOrders(data.orders);
    renderPager();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">${esc(err.message)}</td></tr>`;
  }
}

function renderOrderStats(s) {
  if (!s) { $('order-stats').innerHTML = ''; return; }
  $('order-stats').innerHTML = `
    <div class="stat-box"><div class="n">${s.total}</div><div class="l">Zamówień</div></div>
    <div class="stat-box"><div class="n">${s.toFulfil}</div><div class="l">Do realizacji</div></div>
    <div class="stat-box"><div class="n">${fmtPLN(s.revenue)}</div><div class="l">Przychód (opłacone)</div></div>`;
}

function renderOrders(list) {
  const tbody = $('order-rows');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Brak zamówień.</td></tr>'; return; }
  tbody.innerHTML = list.map((o) => `
    <tr class="clickable" data-id="${esc(o.id)}">
      <td class="col-check"><input type="checkbox" class="row-check" data-sel="${esc(o.id)}" ${selectedOrders.has(o.id) ? 'checked' : ''} aria-label="Zaznacz"></td>
      <td class="cell-title"><span class="order-id">${esc(o.id)}</span></td>
      <td class="hide-sm" data-label="Data">${esc(fmtDateTime(o.createdAt))}</td>
      <td class="hide-sm cell-sub">${esc(o.customer?.name || '—')}<div class="pmeta">${esc(o.customer?.email || '')}</div></td>
      <td class="price" data-label="Kwota">${fmtPLN(o.total)}</td>
      <td data-label="Płatność"><span class="ostatus ${esc(o.paymentStatus)}">${esc(PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus)}</span></td>
      <td data-label="Status"><span class="ostatus ${esc(o.status)}">${esc(ORDER_STATUS_LABELS[o.status] || o.status)}</span></td>
      <td class="hide-sm ship-cell">${shipCell(o)}</td>
    </tr>`).join('');
  syncSelection();
}

function renderPager() {
  const pager = $('orders-pager');
  const from = ordersState.total ? ordersState.offset + 1 : 0;
  const to = Math.min(ordersState.offset + ordersState.limit, ordersState.total);
  const canPrev = ordersState.offset > 0;
  const canNext = to < ordersState.total;
  pager.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${canPrev ? '' : 'disabled'} id="pg-prev">← Poprzednie</button>
    <span>${from} do ${to} z ${ordersState.total}</span>
    <button class="btn btn-ghost btn-sm" ${canNext ? '' : 'disabled'} id="pg-next">Następne →</button>`;
  if (canPrev) $('pg-prev').addEventListener('click', () => { ordersState.offset = Math.max(0, ordersState.offset - ordersState.limit); loadOrders(); });
  if (canNext) $('pg-next').addEventListener('click', () => { ordersState.offset += ordersState.limit; loadOrders(); });
}

// Row click -> open detail (checkbox clicks only toggle selection)
$('order-rows').addEventListener('click', (e) => {
  const cb = e.target.closest('input[data-sel]');
  if (cb) {
    if (cb.checked) selectedOrders.add(cb.dataset.sel); else selectedOrders.delete(cb.dataset.sel);
    syncSelection();
    return;
  }
  if (e.target.closest('.col-check')) return;
  const tr = e.target.closest('tr[data-id]');
  if (tr) openOrder(tr.dataset.id);
});

const orderModal = $('order-modal');
$('om-close').addEventListener('click', closeOrder);
$('om-cancel').addEventListener('click', closeOrder);
orderModal.addEventListener('click', (e) => { if (e.target === orderModal) closeOrder(); });
$('om-save').addEventListener('click', saveOrder);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !orderModal.classList.contains('hidden')) closeOrder(); });

async function openOrder(id) {
  notice($('om-error'), '', 'err');
  let o;
  try { o = await api('/api/orders/' + encodeURIComponent(id)); }
  catch (err) { ordersNotice(err.message, 'err'); return; }
  currentOrder = o;

  $('om-title').textContent = 'Zamówienie ' + o.id;
  const inv = o.invoice;
  const invHtml = inv ? `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
      <div><b>Faktura:</b> ${esc(inv.company || '')}</div>
      ${inv.nip ? `<div><b>NIP:</b> ${esc(inv.nip)}</div>` : ''}
      <div>${esc(inv.street || '')}</div>
      <div>${esc(inv.postcode || '')} ${esc(inv.city || '')}</div>
    </div>` : '';
  $('om-customer').innerHTML = `
    <div><b>Imię:</b> ${esc(o.customer?.name || '—')}</div>
    <div><b>E-mail:</b> ${esc(o.customer?.email || '—')}</div>
    <div><b>Telefon:</b> ${esc(o.customer?.phone || '—')}</div>${invHtml}`;

  const addr = o.shippingAddress;
  const shipDetail = o.inpostPoint
    ? `<div><b>Punkt odbioru:</b> ${esc(o.inpostPoint)}</div>${o.pointName ? `<div>${esc(o.pointName)}</div>` : ''}`
    : (addr ? `<div>${esc(addr.street || '')}</div><div>${esc(addr.postcode || '')} ${esc(addr.city || '')}</div><div>${esc(addr.country || '')}</div>` : '<div>—</div>');
  $('om-shipping').innerHTML = `<div><b>Metoda:</b> ${esc(o.shippingLabel || o.shippingMethod || '—')}</div>${shipDetail}`;

  $('om-items').innerHTML = (o.items || []).map((it) => `
    <div class="od-item"><span>${esc(it.name)} ${it.size ? '· ' + esc(it.size) : ''} × ${it.qty}</span><span>${fmtPLN((it.price || 0) * it.qty)}</span></div>`).join('');
  $('om-subtotal').textContent = fmtPLN(o.subtotal);
  if (o.discount > 0) {
    $('om-disc-row').style.display = 'flex';
    $('om-discount').textContent = '−' + fmtPLN(o.discount) + (o.discountCode ? ` (${o.discountCode})` : '');
  } else {
    $('om-disc-row').style.display = 'none';
  }
  $('om-ship-cost').textContent = o.shippingCost ? fmtPLN(o.shippingCost) : 'Gratis';
  $('om-total').textContent = fmtPLN(o.total);

  $('om-status').value = ['paid', 'fulfilled', 'shipped', 'completed', 'cancelled'].includes(o.status) ? o.status : 'paid';
  $('om-tracking').value = o.trackingNumber || '';
  $('om-notes').value = o.notes || '';
  $('om-meta').textContent =
    `Płatność: ${PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus}`
    + ` · Utworzono ${fmtDateTime(o.createdAt)}`
    + (o.paidAt ? ` · Opłacono ${fmtDateTime(o.paidAt)}` : '')
    + (o.termsAcceptedAt ? ` · ✓ Regulamin zaakceptowany ${fmtDateTime(o.termsAcceptedAt)}` : '')
    + (o.stripePaymentIntent ? ` · ${o.stripePaymentIntent}` : '');

  renderShipSection(o);
  orderModal.classList.remove('hidden');
}

/* ---------- Shipments (Furgonetka / InPost) ---------- */
const CARRIER_NAMES = { inpost: 'InPost', inpostkurier: 'InPost Kurier', dpd: 'DPD', poczta: 'Poczta Polska', pocztex: 'Pocztex', orlen: 'Orlen Paczka', ruch: 'Orlen Paczka' };
const SHIP_STATUS_LABELS = {
  // Furgonetka
  waiting: 'Szkic (niezamówiona)', ordering: 'Zamawianie…', ordered: 'Zamówiona', sent: 'Nadana',
  in_transit: 'W drodze', delivered: 'Doręczona', returned: 'Zwrócona',
  // InPost ShipX
  created: 'Utworzona', confirmed: 'Potwierdzona', offer_selected: 'Wybrano ofertę',
  offers_prepared: 'Oferty gotowe', dispatched_by_sender: 'Nadana',
  collected_from_sender: 'Odebrana od nadawcy', taken_by_courier: 'U kuriera',
  adopted_at_source_branch: 'W sortowni', out_for_delivery: 'W doręczeniu',
  ready_to_pickup: 'Gotowa do odbioru',
  canceled: 'Anulowana', cancelled: 'Anulowana',
};
const shipStatusLabel = (st) => SHIP_STATUS_LABELS[st] || st || '—';
const carrierName = (o) => CARRIER_NAMES[o.shipment?.carrier] || o.shipment?.carrier || (o.shipment?.provider === 'inpost' ? 'InPost' : '—');

// Selection for bulk label printing.
const selectedOrders = new Set();
function syncSelection() {
  $('orders-labels').textContent = `Drukuj etykiety (${selectedOrders.size})`;
  $('orders-labels').disabled = selectedOrders.size === 0;
  const boxes = [...document.querySelectorAll('#order-rows input[data-sel]')];
  $('orders-check-all').checked = boxes.length > 0 && boxes.every((b) => b.checked);
}
$('orders-check-all').addEventListener('change', (e) => {
  document.querySelectorAll('#order-rows input[data-sel]').forEach((b) => {
    b.checked = e.target.checked;
    if (b.checked) selectedOrders.add(b.dataset.sel); else selectedOrders.delete(b.dataset.sel);
  });
  syncSelection();
});

function shipCell(o) {
  const sh = o.shipment;
  if (!sh) return o.paymentStatus === 'paid' ? '<span style="color:var(--red)">brak etykiety</span>' : '—';
  const label = shipStatusLabel(sh.status);
  return `<b>${esc(carrierName(o))}</b> · ${esc(label)}${o.trackingNumber ? `<div>${esc(o.trackingNumber)}</div>` : ''}`;
}

// Opens a PDF response in a new tab (labels need the admin auth header).
async function openPdf(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  if (!res.ok) {
    let m = 'Nie udało się pobrać etykiety.';
    try { m = (await res.json()).error || m; } catch { /* not json */ }
    throw new Error(m);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  window.open(href, '_blank');
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

$('orders-labels').addEventListener('click', async () => {
  const btn = $('orders-labels');
  btn.disabled = true;
  ordersNotice('Generuję etykiety…', 'ok');
  try {
    await openPdf('/api/orders/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedOrders], format: 'a6' }),
    });
    ordersNotice('Etykiety gotowe do druku.', 'ok');
  } catch (err) {
    ordersNotice(err.message, 'err');
  } finally {
    syncSelection();
  }
});

$('orders-ship-config').addEventListener('click', async () => {
  const box = $('ship-config');
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = 'Sprawdzam połączenie z Furgonetką…';
  try {
    const c = await api('/api/orders/shipping-config');
    const f = c.furgonetka;
    const services = f.services || [];
    const svcName = (id) => { const s = services.find((x) => x.id === id); return s ? `${s.name || s.service} (#${id})` : (id ? `#${id}` : ''); };
    const methodRows = Object.entries(c.methods).map(([k, m]) => {
      const id = f.mapping ? f.mapping[k] : null;
      const via = m.provider === 'furgonetka'
        ? (id ? `<span class="ok">Furgonetka → ${esc(svcName(id))}</span>` : (f.ok ? '<span class="bad">brak aktywnego przewoźnika na koncie</span>' : 'Furgonetka'))
        : (m.provider === 'inpost' ? 'InPost ShipX' : '<span class="bad">brak integracji — ręcznie</span>');
      return `<tr><td>${esc(m.label)}</td><td>${via}</td></tr>`;
    }).join('');
    box.innerHTML = `
      <h4>Furgonetka: ${f.configured
        ? (f.ok ? `<span class="ok">połączono</span> (${esc(f.env)})` : `<span class="bad">błąd</span> — ${esc(f.error || '')}`)
        : '<span class="bad">nieskonfigurowana</span>'}</h4>
      ${f.missing.length ? `<div>Brakujące zmienne w Vercel: <b>${f.missing.map(esc).join(', ')}</b></div>` : ''}
      <div>Nadawca: ${esc([f.sender.name, f.sender.street, `${f.sender.postcode} ${f.sender.city}`, f.sender.phone].filter((x) => x && x.trim()).join(', ') || '—')}</div>
      <div>Automatyczne zamawianie etykiety po opłaceniu: <b>${f.autoOrder ? 'tak' : 'nie (tylko szkic)'}</b>${f.balance != null ? ` · Saldo: <b>${esc(f.balance)} zł</b>` : ''}</div>
      <table>${methodRows}</table>`;
  } catch (err) {
    box.innerHTML = `<span class="bad">${esc(err.message)}</span>`;
  }
});

function renderShipSection(o) {
  const box = $('om-ship');
  const sh = o.shipment;
  // Shipment actions only for paid orders or ones that already have a parcel.
  if (!sh && o.paymentStatus !== 'paid') { box.hidden = true; return; }
  box.hidden = false;
  $('om-ship-create').hidden = !!sh;
  $('om-ship-have').hidden = !sh;
  $('om-ship-title').textContent = sh?.provider === 'inpost' ? 'Przesyłka InPost (ShipX)' : 'Przesyłka (Furgonetka)';

  if (!sh) {
    $('om-ship-hint').textContent = 'Zamówienie tworzy paczkę u przewoźnika z metody dostawy klienta i od razu generuje etykietę (koszt pobiera Furgonetka). Szkic możesz poprawić w panelu Furgonetki.';
    return;
  }
  const ordered = sh.provider === 'inpost' || !!sh.ordered;
  $('om-ship-carrier').textContent = carrierName(o);
  $('om-ship-tracking').textContent = o.trackingNumber || (ordered ? 'nadawany…' : '—');
  const st = $('om-ship-status');
  st.textContent = shipStatusLabel(sh.status);
  st.className = 'ostatus ' + (sh.status === 'delivered' ? 'completed' : (['cancelled', 'canceled'].includes(sh.status) ? 'cancelled' : (ordered ? 'shipped' : 'pending')));
  $('om-ship-price-row').hidden = sh.price == null;
  $('om-ship-price').textContent = sh.price != null ? `${sh.price} zł` : '—';
  $('om-ship-id').textContent = sh.id;
  $('om-ship-edit').hidden = !sh.editUrl;
  if (sh.editUrl) $('om-ship-edit').href = sh.editUrl;

  $('om-order-ship').hidden = ordered || sh.status === 'ordering';
  $('om-label-a6').hidden = !ordered;
  $('om-label-a4').hidden = !ordered;
  $('om-cancel-ship').hidden = sh.provider === 'inpost';

  const ev = sh.events || [];
  $('om-ship-events').hidden = !ev.length;
  $('om-ship-events').innerHTML = ev.map((e) => `<li><time>${esc(fmtDateTime(e.datetime))}${e.branch ? ' · ' + esc(e.branch) : ''}</time>${esc(e.status)}</li>`).join('');
}

function applyOrderUpdate(updated, msg) {
  currentOrder = updated;
  const idx = ordersCache.findIndex((x) => x.id === updated.id);
  if (idx >= 0) ordersCache[idx] = updated;
  renderOrders(ordersCache);
  renderShipSection(updated);
  if (updated.trackingNumber) $('om-tracking').value = updated.trackingNumber;
  if (msg) ordersNotice(msg, 'ok');
}

function shipErr(err) {
  if (err.status === 401) { notice($('om-error'), 'Sesja wygasła. Zaloguj się ponownie.', 'err'); setTimeout(() => { closeOrder(); show('login'); }, 1200); }
  else notice($('om-error'), err.message, 'err');
}

async function shipAction(btn, fn) {
  if (!currentOrder) return;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Chwila…';
  notice($('om-error'), '', 'err');
  try { await fn(); } catch (err) { shipErr(err); } finally { btn.disabled = false; btn.textContent = label; }
}

function shipmentBody(order) {
  return { template: $('om-parcel').value, weightKg: Number($('om-weight').value) || 1, order };
}
const shipUrl = () => `/api/orders/${encodeURIComponent(currentOrder.id)}/shipment`;

$('om-create-ship').addEventListener('click', (e) => shipAction(e.currentTarget, async () => {
  const u = await api(shipUrl(), { method: 'POST', body: shipmentBody(true) });
  applyOrderUpdate(u, u.shipment?.ordered ? `Przesyłka zamówiona dla ${u.id} — etykieta gotowa.` : `Przesyłka ${u.id} jest zamawiana — odśwież status za chwilę.`);
}));
$('om-draft-ship').addEventListener('click', (e) => shipAction(e.currentTarget, async () => {
  const u = await api(shipUrl(), { method: 'POST', body: shipmentBody(false) });
  applyOrderUpdate(u, `Utworzono szkic przesyłki dla ${u.id}.`);
}));
$('om-order-ship').addEventListener('click', (e) => shipAction(e.currentTarget, async () => {
  const u = await api(shipUrl(), { method: 'POST', body: shipmentBody(true) });
  applyOrderUpdate(u, u.shipment?.ordered ? 'Przesyłka zamówiona — etykieta gotowa.' : 'Zamawianie w toku — odśwież status za chwilę.');
}));
$('om-refresh-ship').addEventListener('click', (e) => shipAction(e.currentTarget, async () => {
  applyOrderUpdate(await api(shipUrl()), 'Zaktualizowano status przesyłki.');
}));
$('om-cancel-ship').addEventListener('click', (e) => shipAction(e.currentTarget, async () => {
  if (!confirm('Anulować tę przesyłkę u przewoźnika? Etykieta przestanie być ważna.')) return;
  applyOrderUpdate(await api(shipUrl(), { method: 'DELETE' }), 'Przesyłka anulowana.');
}));
$('om-label-a6').addEventListener('click', (e) => shipAction(e.currentTarget, () => openPdf(`/api/orders/${encodeURIComponent(currentOrder.id)}/label?format=a6`)));
$('om-label-a4').addEventListener('click', (e) => shipAction(e.currentTarget, () => openPdf(`/api/orders/${encodeURIComponent(currentOrder.id)}/label?format=a4`)));

function closeOrder() { orderModal.classList.add('hidden'); currentOrder = null; }

async function saveOrder() {
  if (!currentOrder) return;
  notice($('om-error'), '', 'err');
  const btn = $('om-save');
  btn.disabled = true;
  try {
    const body = {
      status: $('om-status').value,
      trackingNumber: $('om-tracking').value.trim(),
      notes: $('om-notes').value.trim(),
    };
    const updated = await api('/api/orders/' + encodeURIComponent(currentOrder.id), { method: 'PATCH', body });
    const idx = ordersCache.findIndex((x) => x.id === updated.id);
    if (idx >= 0) ordersCache[idx] = updated;
    renderOrders(ordersCache);
    closeOrder();
    ordersNotice(`Zapisano zmiany w ${updated.id}.`, 'ok');
  } catch (err) {
    if (err.status === 401) {
      notice($('om-error'), 'Sesja wygasła. Zaloguj się ponownie.', 'err');
      setTimeout(() => { closeOrder(); show('login'); }, 1200);
    } else {
      notice($('om-error'), err.message, 'err');
    }
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Boot ---------- */
(async function boot() {
  const authed = await checkSession();
  if (authed) await enterPanel();
  else show('login');
})();
