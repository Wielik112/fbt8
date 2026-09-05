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
    return `${p.name} od ${p.brand}. ${p.cat} w outletowej cenie — sprawdzona jakość i sportowy charakter. `
      + `Idealne uzupełnienie Twojej garderoby treningowej.`;
  }

  function render(p, all) {
    document.title = `${p.name} | FBT Outlet`;
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', (p.description || defaultDesc(p)).slice(0, 155));

    $('#pd-crumb').textContent = p.name;
    $('#pd-name').textContent = p.name;
    $('#pd-price').textContent = `${p.price} zł`;
    $('#pd-tag').textContent = [p.tag, p.condition].filter(Boolean).join(' · ');

    if (p.old && p.old > p.price) {
      const was = $('#pd-old'); was.textContent = `${p.old} zł`; was.hidden = false;
      const save = $('#pd-save'); save.textContent = `Oszczędzasz ${p.old - p.price} zł`; save.hidden = false;
    }

    // Photo gallery: main photo first, then any extra gallery photos.
    const gallery = [p.image, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean);
    const mainEl = $('#pd-main');
    const mainLogo = $('#pd-main-logo');
    mainLogo.alt = p.name;
    if (gallery.length) {
      mainEl.style.background = '#0f0f12';
      mainLogo.src = gallery[0];
      mainLogo.style.width = '100%';
      mainLogo.style.height = '100%';
      mainLogo.style.objectFit = 'contain';
      mainLogo.style.padding = '24px';
      mainLogo.style.opacity = '1';
    } else {
      mainEl.style.background = p.gradient || DEFAULT_GRADIENT;
    }

    $('#pd-desc').textContent = (p.description && p.description.trim()) ? p.description : defaultDesc(p);

    // Sizes
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    if (sizes.length) {
      const box = $('#pd-sizes');
      box.innerHTML = sizes.map((s, i) => `<span class="pd-size${i === 0 ? ' active' : ''}">${s}</span>`).join('');
      box.querySelectorAll('.pd-size').forEach((el) => el.addEventListener('click', () => {
        box.querySelectorAll('.pd-size').forEach((x) => x.classList.remove('active'));
        el.classList.add('active');
      }));
    } else {
      $('#pd-size-wrap').hidden = true;
    }

    // Meta
    $('#pd-code').textContent = 'FBT-' + String(p.id).toUpperCase();
    $('#pd-brand').textContent = p.brand;
    $('#pd-cat').textContent = p.cat;
    $('#pd-cond').textContent = p.condition;
    $('#pd-colors').textContent = (Array.isArray(p.colors) && p.colors.length) ? p.colors.join(', ') : '—';

    // Add-to-cart: main.js already bound the click handler to this button;
    // it reads these data-* attributes at click time.
    const addBtn = $('#pd-add');
    addBtn.dataset.add = p.id;
    addBtn.dataset.name = p.name;
    addBtn.dataset.price = p.price;
    addBtn.dataset.image = gallery.length ? gallery[0] : '';

    // Gallery thumbnails
    const thumbs = $('#pd-thumbs');
    if (gallery.length) {
      // Real product photos — click a thumb to swap the main image.
      thumbs.innerHTML = gallery.map((src, i) =>
        `<div class="pd-thumb${i === 0 ? ' active' : ''}" data-img="${src}"><img src="${src}" alt=""></div>`).join('');
      thumbs.querySelectorAll('.pd-thumb').forEach((t) => t.addEventListener('click', () => {
        thumbs.querySelectorAll('.pd-thumb').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        mainLogo.src = t.dataset.img;
      }));
    } else {
      // No photos uploaded — fall back to decorative gradient tiles.
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
