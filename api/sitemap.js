import { ensureSchema, listProducts } from './_lib/db.js';
import { baseUrl } from './_lib/commerce.js';

// Strony statyczne warte indeksowania (bez koszyka/zamówienia/panelu).
const STATIC_PAGES = [
  { path: '', priority: '1.0', freq: 'daily' },
  { path: 'sklep', priority: '0.9', freq: 'daily' },
  { path: 'o-nas', priority: '0.5', freq: 'monthly' },
  { path: 'kontakt', priority: '0.5', freq: 'monthly' },
  { path: 'opinie', priority: '0.6', freq: 'weekly' },
  { path: 'regulamin', priority: '0.3', freq: 'yearly' },
  { path: 'polityka-prywatnosci', priority: '0.3', freq: 'yearly' },
  { path: 'sledzenie', priority: '0.3', freq: 'monthly' },
];

const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// GET /sitemap.xml (przez rewrite) — pełna mapa strony: strony statyczne
// oraz wszystkie aktualne produkty z bazy. Dzięki temu nowe produkty
// pojawiają się w sitemapie automatycznie.
export default async function handler(req, res) {
  const base = baseUrl(req).replace(/\/+$/, '');
  const today = new Date().toISOString().slice(0, 10);

  let products = [];
  try {
    await ensureSchema();
    products = await listProducts();
  } catch {
    // Brak bazy — zwróć przynajmniej strony statyczne.
  }

  const entries = [];
  for (const p of STATIC_PAGES) {
    const loc = p.path ? `${base}/${p.path}` : `${base}/`;
    entries.push(
      `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    );
  }
  for (const prod of products) {
    if (!prod || !prod.id) continue;
    const loc = `${base}/produkt?id=${encodeURIComponent(prod.id)}`;
    entries.push(
      `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    );
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries.join('\n') +
    `\n</urlset>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  return res.status(200).send(xml);
}
