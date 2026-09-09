/* ============================================
   FBT OUTLET — Interactions
   ============================================ */

/* ---------- Nav scroll state ---------- */
const nav = document.querySelector('.nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- Mobile menu ---------- */
const burger = document.querySelector('.burger');
const mobileMenu = document.querySelector('.mobile-menu');
if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    burger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  });
  mobileMenu.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => {
      burger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    })
  );
}

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver(
  (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 70}ms`;
  io.observe(el);
});

/* ---------- Cart state (in-memory) ---------- */
const CART_KEY = 'fbt_cart';
function getCart() {
  try { return JSON.parse(window.name || '{}').cart || []; } catch { return []; }
}
function saveCart(cart) {
  let store = {}; try { store = JSON.parse(window.name || '{}'); } catch {}
  store.cart = cart;
  window.name = JSON.stringify(store);
  updateCartCount();
}
function updateCartCount() {
  const count = getCart().reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'grid' : 'none';
  });
}
function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(i => i.id === product.id && i.size === product.size);
  if (existing) existing.qty += product.qty || 1;
  else cart.push({ ...product, qty: product.qty || 1 });
  saveCart(cart);
  showToast(`${product.name} dodano do koszyka`);
}

/* ---------- Toast ---------- */
let toastTimer;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg><span></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector('span').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

updateCartCount();

/* ---------- Quantity steppers ---------- */
document.querySelectorAll('.qty').forEach(qty => {
  const input = qty.querySelector('input');
  qty.querySelector('.q-minus')?.addEventListener('click', () => { input.value = Math.max(1, +input.value - 1); });
  qty.querySelector('.q-plus')?.addEventListener('click', () => { input.value = +input.value + 1; });
});

/* ---------- Size / chip selectors ---------- */
document.querySelectorAll('.pd-sizes').forEach(group => {
  group.querySelectorAll('.pd-size').forEach(s =>
    s.addEventListener('click', () => {
      group.querySelectorAll('.pd-size').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    })
  );
});

/* ---------- Product detail thumbs ---------- */
document.querySelectorAll('.pd-thumbs').forEach(thumbs => {
  const main = document.querySelector('.pd-main-img');
  thumbs.querySelectorAll('.pd-thumb').forEach(t =>
    t.addEventListener('click', () => {
      thumbs.querySelectorAll('.pd-thumb').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      if (main && t.dataset.bg) main.style.background = t.dataset.bg;
    })
  );
});

/* ---------- Add-to-cart buttons ---------- */
document.querySelectorAll('[data-add]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const card = btn.closest('[data-product]');
    let product;
    if (card) {
      product = {
        id: card.dataset.product,
        name: card.dataset.name,
        price: +card.dataset.price,
        image: card.querySelector('.product-media img')?.src || '',
        qty: 1
      };
    } else {
      // product detail page
      const size = document.querySelector('.pd-size.active')?.textContent || 'M';
      const qtyEl = document.querySelector('.pd-qty-row .qty input');
      product = {
        id: btn.dataset.add,
        name: btn.dataset.name,
        price: +btn.dataset.price,
        image: btn.dataset.image || '',
        size,
        qty: qtyEl ? +qtyEl.value : 1
      };
    }
    addToCart(product);
  });
});

/* ---------- Mobile filter toggle ---------- */
document.querySelector('.filter-toggle')?.addEventListener('click', () => {
  document.querySelector('.filters')?.classList.toggle('open');
});

/* ---------- Forms (demo submit) ---------- */
document.querySelectorAll('form[data-demo]').forEach(form => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast(form.dataset.demo || 'Wysłano, dziękujemy!');
    form.reset();
  });
});

/* ---------- Active nav link ---------- */
const path = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(a => {
  if (a.getAttribute('href') === path) a.classList.add('active');
});

/* ============================================
   Search overlay — animated placeholder + live suggestions
   ============================================ */
(function initSearch() {
  // Build the overlay once and attach to <body>.
  const overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-panel" role="dialog" aria-label="Wyszukiwarka produktów">
      <form class="search-box" role="search">
        <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" class="search-input" autocomplete="off" aria-label="Szukaj produktów">
        <button type="button" class="search-close" aria-label="Zamknij">×</button>
      </form>
      <div class="search-results" id="search-results"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input   = overlay.querySelector('.search-input');
  const results = overlay.querySelector('#search-results');
  const form    = overlay.querySelector('.search-box');

  // ---- Animated typewriter placeholder ----
  const SAMPLES = ['Nike', 'Adidas', 'Puma', 'Mercurial', 'korki', 'rękawice bramkarskie', 'Predator', 'halówki', 'piłki'];
  let sIdx = 0, cIdx = 0, deleting = false, typeTimer = null;
  function tick() {
    const word = SAMPLES[sIdx];
    cIdx += deleting ? -1 : 1;
    input.setAttribute('placeholder', 'Szukaj: ' + word.slice(0, cIdx) + '▍');
    let delay = deleting ? 45 : 90;
    if (!deleting && cIdx === word.length) { deleting = true; delay = 1100; }
    else if (deleting && cIdx === 0) { deleting = false; sIdx = (sIdx + 1) % SAMPLES.length; delay = 350; }
    typeTimer = setTimeout(tick, delay);
  }
  function startType() { if (!typeTimer && !input.value) tick(); }
  function stopType() { clearTimeout(typeTimer); typeTimer = null; }

  // ---- Product data (fetched once, cached) ----
  let cache = null;
  async function getProducts() {
    if (cache) return cache;
    try {
      const r = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      cache = r.ok ? await r.json() : [];
    } catch { cache = []; }
    return Array.isArray(cache) ? cache : [];
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let debounce;
  async function renderResults() {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; results.classList.remove('has'); return; }
    const list = (await getProducts()).filter((p) => {
      const hay = `${p.name || ''} ${p.brand || ''} ${p.cat || ''} ${p.level || ''} ${p.surface || ''}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 8);

    results.classList.add('has');
    if (!list.length) {
      results.innerHTML = `<div class="search-empty">Brak wyników dla „${esc(input.value.trim())}”. Naciśnij Enter, aby przejść do sklepu.</div>`;
      return;
    }
    results.innerHTML = list.map((p) => {
      const img = p.image
        ? `<span class="sr-img" style="background-image:url('${esc(p.image)}')"></span>`
        : `<span class="sr-img" style="background:${esc(p.gradient || 'linear-gradient(135deg,#2a0409,#1c1c22)')}"></span>`;
      return `<a class="search-result" href="produkt.html?id=${encodeURIComponent(p.id)}">
        ${img}
        <span class="sr-main"><span class="sr-name">${esc(p.name)}</span><span class="sr-meta">${esc(p.brand)} · ${esc(p.cat)}</span></span>
        <span class="sr-price">${esc(p.price)} zł</span>
      </a>`;
    }).join('');
  }

  function open() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    input.value = '';
    results.innerHTML = '';
    results.classList.remove('has');
    startType();
    setTimeout(() => input.focus(), 60);
    getProducts(); // warm the cache
  }
  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    stopType();
  }
  function goToShop() {
    const q = input.value.trim();
    location.href = q ? `sklep.html?q=${encodeURIComponent(q)}` : 'sklep.html';
  }

  // Wire every search icon in the nav to open the overlay.
  document.querySelectorAll('[aria-label="Szukaj"]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.preventDefault(); open(); });
  });

  input.addEventListener('input', () => {
    if (input.value) stopType(); else startType();
    clearTimeout(debounce);
    debounce = setTimeout(renderResults, 160);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); goToShop(); });
  overlay.querySelector('.search-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
})();
