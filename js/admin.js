/* ============================================
   FBT OUTLET — Admin panel logic
   Talks to /api/login and /api/products.
   Auth uses an HttpOnly session cookie; a bearer
   token is also kept as a same-origin fallback.
   ============================================ */

const CATEGORIES = ['Koszulki', 'Bluzy', 'Spodnie', 'Kurtki', 'Obuwie', 'Akcesoria'];
const CONDITIONS = ['Nowy', 'Używany'];
const TOKEN_KEY = 'fbt_admin_token';
const DEFAULT_GRADIENT = 'linear-gradient(135deg,#2a0409,#1c1c22)';

const $ = (id) => document.getElementById(id);
const views = { login: $('login-view'), panel: $('panel-view') };

let products = [];

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
    return `
    <tr data-id="${esc(p.id)}">
      <td><div class="swatch" style="background:${esc(p.gradient || DEFAULT_GRADIENT)}"></div></td>
      <td>
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${esc(p.brand)} · ${esc(p.id)}</div>
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

  $('f-id').value        = product?.id || '';
  $('f-name').value      = product?.name || '';
  $('f-brand').value     = product?.brand || '';
  $('f-price').value     = product?.price ?? '';
  $('f-old').value       = product?.old ?? '';
  $('f-stars').value     = product?.stars ?? 5;
  $('f-description').value = product?.description || '';
  $('f-tag').value       = product?.tag || '';
  $('f-tagType').value   = product?.tagType || 'sale';
  $('f-sizes').value     = (product?.sizes || []).join(', ');
  $('f-colors').value    = (product?.colors || []).join(', ');
  $('f-gradient').value  = product?.gradient || DEFAULT_GRADIENT;
  updateGradPreview();

  modal.classList.remove('hidden');
  $('f-name').focus();
}

function closeModal() { modal.classList.add('hidden'); }

function updateGradPreview() {
  $('grad-preview').style.background = $('f-gradient').value.trim() || DEFAULT_GRADIENT;
}
$('f-gradient').addEventListener('input', updateGradPreview);

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
    price: $('f-price').value,
    old: $('f-old').value,
    description: $('f-description').value.trim(),
    stars: $('f-stars').value,
    tag: $('f-tag').value.trim(),
    tagType: $('f-tagType').value,
    sizes: splitList($('f-sizes').value),
    colors: splitList($('f-colors').value),
    gradient: $('f-gradient').value.trim(),
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

/* ---------- Boot ---------- */
(async function boot() {
  const authed = await checkSession();
  if (authed) await enterPanel();
  else show('login');
})();
