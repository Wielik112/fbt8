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
  qty.querySelector('.q-plus')?.addEventListener('click', () => {
    const max = input.dataset.max ? +input.dataset.max : Infinity;
    input.value = Math.min(max, +input.value + 1);
  });
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
      const activeSize = document.querySelector('.pd-size.active');
      if (activeSize && activeSize.classList.contains('out')) { showToast('Ten rozmiar jest niedostępny'); return; }
      const size = activeSize?.dataset.size || activeSize?.querySelector('.ps-label')?.textContent || activeSize?.textContent?.trim() || 'M';
      const qtyEl = document.querySelector('.pd-qty-row .qty input');
      const max = qtyEl && qtyEl.dataset.max ? +qtyEl.dataset.max : Infinity;
      const qty = qtyEl ? Math.min(max, Math.max(1, +qtyEl.value || 1)) : 1;
      product = {
        id: btn.dataset.add,
        name: btn.dataset.name,
        price: +btn.dataset.price,
        image: btn.dataset.image || '',
        size,
        qty
      };
    }
    addToCart(product);
  });
});

/* ---------- Mobile filter toggle ---------- */
document.querySelector('.filter-toggle')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const filters = document.querySelector('.filters');
  if (!filters) return;
  const open = filters.classList.toggle('open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.lastChild.textContent = open ? ' Ukryj filtry' : ' Filtry';
  if (open) filters.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

/* ---------- Brand marquee: seamless infinite fill ----------
   Powiela zestaw logo tyle razy, by zawsze wypełniał ekran (także 4K),
   a przesunięcie o -50% odpowiada dokładnie połowie ścieżki — dzięki temu
   loga lecą w kółko bez przerwy i bez pustego miejsca. */
(function () {
  const track = document.querySelector('.brand-track');
  if (!track) return;
  const marquee = track.closest('.brand-marquee') || track.parentElement;
  const baseHTML = track.innerHTML; // jeden komplet logo
  const SPEED = 70; // px na sekundę (stała prędkość niezależnie od liczby kopii)

  function build() {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.style.animation = 'none';
    track.innerHTML = baseHTML;               // zmierz szerokość jednego kompletu
    // eslint-disable-next-line no-unused-expressions
    track.offsetWidth;                        // wymuś reflow
    const oneSet = track.scrollWidth;
    if (reduce || !oneSet) return;            // reduced-motion: zostaw jeden komplet, bez animacji
    const container = marquee.clientWidth || window.innerWidth || 1200;
    // Każda „połowa" ścieżki musi zakryć ekran → zapas +1 komplet.
    const halfSets = Math.ceil(container / oneSet) + 1;
    const copies = halfSets * 2;              // parzyście, by -50% trafiało w granicę kompletu
    track.innerHTML = baseHTML.repeat(copies);
    const halfWidth = oneSet * halfSets;
    const dur = Math.max(18, Math.round(halfWidth / SPEED));
    track.style.animation = `scroll-x ${dur}s linear infinite`;
  }

  build();
  window.addEventListener('load', build);
  let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 200); });
})();

/* ============================================
   SEO — canonical, Open Graph / Twitter, JSON-LD.
   Built from the current origin so it stays correct
   on the Vercel domain today and a custom domain later.
   ============================================ */
(function initSEO() {
  const origin = location.origin;
  const SITE = 'FBT Outlet';
  const logo = origin + '/assets/logo.png';

  // Canonical: clean URL (no .html / index), keep ?id on product pages.
  let clean = location.pathname.replace(/index\.html$/, '').replace(/\.html$/, '');
  if (clean === '') clean = '/';
  const id = new URLSearchParams(location.search).get('id');
  const canonical = origin + clean + (clean.replace(/\/$/, '').endsWith('produkt') && id ? '?id=' + encodeURIComponent(id) : '');

  const head = document.head;
  const descEl = document.querySelector('meta[name="description"]');
  const description = descEl ? descEl.getAttribute('content') : '';
  const title = document.title;

  function upsertLink(rel, href) {
    let el = head.querySelector(`link[rel="${rel}"]`);
    if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); head.appendChild(el); }
    el.setAttribute('href', href);
  }
  function meta(attr, key, val, force) {
    let el = head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); head.appendChild(el); }
    else if (!force) return; // keep any hand-written value
    el.setAttribute('content', val);
  }

  upsertLink('canonical', canonical);
  meta('name', 'theme-color', '#08080A', true);

  // Open Graph
  meta('property', 'og:site_name', SITE);
  meta('property', 'og:locale', 'pl_PL');
  meta('property', 'og:type', clean === '/' ? 'website' : 'website');
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:url', canonical, true);
  meta('property', 'og:image', logo, true);

  // Twitter
  meta('name', 'twitter:card', 'summary_large_image');
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', description);
  meta('name', 'twitter:image', logo, true);

  // JSON-LD: Organization + WebSite with on-site search action.
  if (!document.getElementById('ld-org')) {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': origin + '/#org',
          name: SITE,
          url: origin + '/',
          logo: logo,
          description: 'Oryginalne obuwie piłkarskie i sportowe renomowanych oraz premium marek w cenach outletowych.'
        },
        {
          '@type': 'WebSite',
          '@id': origin + '/#website',
          url: origin + '/',
          name: SITE,
          inLanguage: 'pl-PL',
          publisher: { '@id': origin + '/#org' },
          potentialAction: {
            '@type': 'SearchAction',
            target: origin + '/sklep.html?q={search_term_string}',
            'query-input': 'required name=search_term_string'
          }
        }
      ]
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'ld-org';
    s.textContent = JSON.stringify(ld);
    head.appendChild(s);
  }
})();

/* ============================================
   Inline nav search — bar next to the magnifier,
   animated placeholder + live suggestions dropdown
   ============================================ */
(function initSearch() {
  const icons = document.querySelectorAll('.nav-actions [aria-label="Szukaj"]');
  if (!icons.length) return;

  const SAMPLES = ['Nike', 'Adidas', 'Puma', 'Mercurial', 'korki', 'rękawice bramkarskie', 'Predator', 'halówki', 'piłki'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Product data fetched once and shared by every search bar on the page.
  let cache = null;
  async function getProducts() {
    if (cache) return cache;
    try {
      const r = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      cache = r.ok ? await r.json() : [];
    } catch { cache = []; }
    return Array.isArray(cache) ? cache : [];
  }

  icons.forEach(setup);

  function setup(icon) {
    // Build the inline bar: [ input ][ 🔍 ] with the icon kept on the right.
    const form = document.createElement('form');
    form.className = 'nav-search';
    form.setAttribute('role', 'search');

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'nav-search-input';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Szukaj produktów');

    const results = document.createElement('div');
    results.className = 'nav-search-results';

    icon.parentNode.insertBefore(form, icon);
    form.appendChild(input);   // input on the LEFT
    form.appendChild(icon);    // magnifier stays on the right
    form.appendChild(results);
    icon.classList.add('nav-search-btn');

    // ---- Animated typewriter placeholder (runs while the field is empty) ----
    let sIdx = 0, cIdx = 0, deleting = false, timer = null;
    function tick() {
      const word = SAMPLES[sIdx];
      cIdx += deleting ? -1 : 1;
      input.setAttribute('placeholder', 'Szukaj: ' + word.slice(0, cIdx) + '▍');
      let delay = deleting ? 45 : 95;
      if (!deleting && cIdx === word.length) { deleting = true; delay = 1100; }
      else if (deleting && cIdx === 0) { deleting = false; sIdx = (sIdx + 1) % SAMPLES.length; delay = 350; }
      timer = setTimeout(tick, delay);
    }
    function startType() { if (!timer && !input.value) tick(); }
    function stopType() { clearTimeout(timer); timer = null; }

    // ---- Live suggestions ----
    let debounce;
    function hide() { results.classList.remove('show'); }
    async function render() {
      const q = input.value.trim().toLowerCase();
      if (!q) { results.innerHTML = ''; hide(); return; }
      const list = (await getProducts()).filter((p) => {
        const hay = `${p.name || ''} ${p.brand || ''} ${p.cat || ''} ${p.level || ''} ${p.surface || ''} ${p.garment || ''}`.toLowerCase();
        return hay.includes(q);
      }).slice(0, 7);

      if (!list.length) {
        results.innerHTML = `<div class="search-empty">Brak wyników. Naciśnij Enter, aby przejść do sklepu.</div>`;
      } else {
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
      results.classList.add('show');
    }

    function goToShop() {
      const q = input.value.trim();
      if (!q) { input.focus(); return; }
      location.href = `sklep.html?q=${encodeURIComponent(q)}`;
    }

    input.addEventListener('input', () => {
      if (input.value) stopType(); else startType();
      clearTimeout(debounce);
      debounce = setTimeout(render, 160);
    });
    input.addEventListener('focus', () => { getProducts(); if (results.innerHTML) results.classList.add('show'); });
    input.addEventListener('blur', () => setTimeout(hide, 160));
    form.addEventListener('submit', (e) => { e.preventDefault(); goToShop(); });
    // The magnifier acts as the submit button.
    icon.addEventListener('click', (e) => { e.preventDefault(); goToShop(); });

    startType();
  }
})();

/* ============================================
   Category navigation — dropdowns (desktop) + accordion (mobile),
   built from window.CATEGORY_TREE (js/categories.js). Add a
   subcategory there and it shows up here automatically.
   ============================================ */
(function buildCategoryNav() {
  const TREE = window.CATEGORY_TREE || [];
  if (!TREE.length) return;
  const enc = encodeURIComponent;
  const caret = '<svg class="cn-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>';

  // ---- Desktop dropdowns (inside .nav-links) ----
  const navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    const sklep = navLinks.querySelector('a[href="sklep.html"]');
    const ref = sklep ? sklep.nextSibling : null;
    TREE.forEach((group) => {
      const wrap = document.createElement('span');
      wrap.className = 'cat-nav';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-nav-btn';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = group.name + caret;
      const menu = document.createElement('div');
      menu.className = 'cat-nav-menu';
      menu.innerHTML =
        `<a class="cn-all" href="sklep.html?main=${enc(group.name)}">Wszystko z: ${group.name}</a>` +
        group.subs.map((s) => `<a href="sklep.html?cat=${enc(s)}">${s}</a>`).join('');
      wrap.appendChild(btn);
      wrap.appendChild(menu);
      navLinks.insertBefore(wrap, ref);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !wrap.classList.contains('open');
        document.querySelectorAll('.cat-nav.open').forEach((o) => {
          o.classList.remove('open');
          o.querySelector('.cat-nav-btn')?.setAttribute('aria-expanded', 'false');
        });
        wrap.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    document.addEventListener('click', () => {
      document.querySelectorAll('.cat-nav.open').forEach((o) => {
        o.classList.remove('open');
        o.querySelector('.cat-nav-btn')?.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.cat-nav.open').forEach((o) => o.classList.remove('open'));
    });
  }

  // ---- Mobile accordion (inside .mobile-menu) ----
  const mob = document.querySelector('.mobile-menu');
  if (mob) {
    const sklep = mob.querySelector('a[href="sklep.html"]');
    const ref = sklep ? sklep.nextSibling : null;
    TREE.forEach((group) => {
      const box = document.createElement('div');
      box.className = 'm-cat';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'm-cat-btn';
      btn.innerHTML = `<span>${group.name}</span><span class="m-cat-caret">+</span>`;
      const list = document.createElement('div');
      list.className = 'm-cat-list';
      list.innerHTML =
        `<a href="sklep.html?main=${enc(group.name)}">Wszystko z: ${group.name}</a>` +
        group.subs.map((s) => `<a href="sklep.html?cat=${enc(s)}">${s}</a>`).join('');
      box.appendChild(btn);
      box.appendChild(list);
      mob.insertBefore(box, ref);
      btn.addEventListener('click', () => {
        const open = box.classList.toggle('open');
        box.querySelector('.m-cat-caret').textContent = open ? '–' : '+';
      });
    });
  }
})();
