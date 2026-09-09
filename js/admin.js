/* ============================================
   FBT OUTLET — Admin panel logic
   Talks to /api/login and /api/products.
   Auth uses an HttpOnly session cookie; a bearer
   token is also kept as a same-origin fallback.
   ============================================ */

const CATEGORIES = ['Buty piłkarskie', 'Buty sportowe', 'Rękawice bramkarskie', 'Piłki', 'Akcesoria'];
const CONDITIONS = ['Nowy'];
const GENDERS = ['Męskie', 'Damskie', 'Unisex'];
const LEVELS = ['Rekreacyjne', 'Treningowe', 'Półprofesjonalne', 'Profesjonalne'];
const SURFACES = ['Na trawę (lanki)', 'Na sztuczną trawę/orlika (turfy)', 'Na mokrą trawę (wkręty/mixy)', 'Na halę (halówki)'];
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

function renderRows() {
  const tbody = $('rows');
  $('count').textContent = products.length;
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Brak produktów. Kliknij „Dodaj produkt”.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map((p) => {
    const condClass = p.condition === 'Nowy' ? 'new' : 'used';
    const old = p.old ? `<span class="old">${esc(p.old)} zł</span>` : '';
    const media = p.image
      ? `<img class="thumb-img" src="${esc(p.image)}" alt="">`
      : `<div class="swatch" style="background:${esc(p.gradient || DEFAULT_GRADIENT)}"></div>`;
    return `
    <tr data-id="${esc(p.id)}">
      <td>${media}</td>
      <td>
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${esc(p.brand)} · ${esc(p.gender || 'Unisex')} · ${esc(p.id)}</div>
      </td>
      <td class="hide-sm">${esc(p.cat)}</td>
      <td class="hide-sm"><span class="pill ${condClass}">${esc(p.condition)}</span></td>
      <td><span class="price">${esc(p.price)} zł ${old}</span></td>
      <td>
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
  ordersState.loaded = false;
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
  return isNaN(d) ? '' : d.toLocaleDateString('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' });
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
      <td><span class="rev-stars">${starStr(r.rating)}</span></td>
      <td><div class="rev-body">${esc(r.body)}</div></td>
      <td class="hide-sm">${esc(r.orderNo)}</td>
      <td class="hide-sm">${esc(fmtDate(r.createdAt))}</td>
      <td><div class="row-actions"><button class="btn btn-danger btn-sm" data-act="del-rev">Usuń</button></div></td>
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

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    $('products-panel').classList.toggle('hidden', tab !== 'products');
    $('reviews-panel').classList.toggle('hidden', tab !== 'reviews');
    if (tab === 'reviews' && !reviewsLoaded) { reviewsLoaded = true; loadReviews(); }
  });
});

/* ---------- Modal (add / edit) ---------- */
const modal = $('modal');

function fillSelect(sel, options, current) {
  sel.innerHTML = options.map((o) => `<option value="${esc(o)}"${o === current ? ' selected' : ''}>${esc(o)}</option>`).join('');
}

function openModal(product) {
  const editing = !!product;
  $('modal-title').textContent = editing ? 'Edytuj produkt' : 'Nowy produkt';
  notice($('form-error'), '', 'err');

  fillSelect($('f-cat'), CATEGORIES, product?.cat || CATEGORIES[0]);
  fillSelect($('f-condition'), CONDITIONS, product?.condition || CONDITIONS[0]);
  fillSelect($('f-gender'), GENDERS, product?.gender || 'Unisex');

  $('f-id').value        = product?.id || '';
  $('f-name').value      = product?.name || '';
  $('f-brand').value     = product?.brand || '';
  $('f-price').value     = product?.price ?? '';
  $('f-old').value       = product?.old ?? '';
  $('f-description').value = product?.description || '';
  $('f-tag').value       = product?.tag || '';
  $('f-tagType').value   = product?.tagType || 'sale';
  $('f-sizes').value     = (product?.sizes || []).join(', ');
  $('f-colors').value    = (product?.colors || []).join(', ');

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
  const payload = {
    name: $('f-name').value.trim(),
    brand: $('f-brand').value.trim(),
    cat: $('f-cat').value,
    condition: $('f-condition').value,
    gender: $('f-gender').value,
    price: $('f-price').value,
    old: $('f-old').value,
    description: $('f-description').value.trim(),
    tag: $('f-tag').value.trim(),
    tagType: $('f-tagType').value,
    sizes: splitList($('f-sizes').value),
    colors: splitList($('f-colors').value),
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

// Tab switching
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    const name = tab.dataset.tab;
    $('tab-products').hidden = name !== 'products';
    $('tab-orders').hidden = name !== 'orders';
    if (name === 'orders' && !ordersState.loaded) loadOrders();
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
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Ładowanie…</td></tr>';
  try {
    const q = new URLSearchParams();
    if (ordersState.status) q.set('status', ordersState.status);
    q.set('limit', ordersState.limit);
    q.set('offset', ordersState.offset);
    q.set('stats', '1');
    const data = await api('/api/orders?' + q.toString());
    ordersState.loaded = true;
    ordersState.total = data.total;
    ordersCache = data.orders;
    renderOrderStats(data.stats);
    renderOrders(data.orders);
    renderPager();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">${esc(err.message)}</td></tr>`;
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
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Brak zamówień.</td></tr>'; return; }
  tbody.innerHTML = list.map((o) => `
    <tr class="clickable" data-id="${esc(o.id)}">
      <td><span class="order-id">${esc(o.id)}</span></td>
      <td class="hide-sm">${esc(fmtDateTime(o.createdAt))}</td>
      <td class="hide-sm">${esc(o.customer?.name || '—')}<div class="pmeta">${esc(o.customer?.email || '')}</div></td>
      <td class="price">${fmtPLN(o.total)}</td>
      <td><span class="ostatus ${esc(o.paymentStatus)}">${esc(PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus)}</span></td>
      <td><span class="ostatus ${esc(o.status)}">${esc(ORDER_STATUS_LABELS[o.status] || o.status)}</span></td>
    </tr>`).join('');
}

function renderPager() {
  const pager = $('orders-pager');
  const from = ordersState.total ? ordersState.offset + 1 : 0;
  const to = Math.min(ordersState.offset + ordersState.limit, ordersState.total);
  const canPrev = ordersState.offset > 0;
  const canNext = to < ordersState.total;
  pager.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${canPrev ? '' : 'disabled'} id="pg-prev">← Poprzednie</button>
    <span>${from}–${to} z ${ordersState.total}</span>
    <button class="btn btn-ghost btn-sm" ${canNext ? '' : 'disabled'} id="pg-next">Następne →</button>`;
  if (canPrev) $('pg-prev').addEventListener('click', () => { ordersState.offset = Math.max(0, ordersState.offset - ordersState.limit); loadOrders(); });
  if (canNext) $('pg-next').addEventListener('click', () => { ordersState.offset += ordersState.limit; loadOrders(); });
}

// Row click -> open detail
$('order-rows').addEventListener('click', (e) => {
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
  $('om-customer').innerHTML = `
    <div><b>Imię:</b> ${esc(o.customer?.name || '—')}</div>
    <div><b>E-mail:</b> ${esc(o.customer?.email || '—')}</div>
    <div><b>Telefon:</b> ${esc(o.customer?.phone || '—')}</div>`;

  const addr = o.shippingAddress;
  const shipDetail = o.inpostPoint
    ? `<div><b>Paczkomat:</b> ${esc(o.inpostPoint)}</div>`
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
    + (o.stripePaymentIntent ? ` · ${o.stripePaymentIntent}` : '');

  orderModal.classList.remove('hidden');
}

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
