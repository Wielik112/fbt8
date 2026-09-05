# FBT Outlet

Static storefront (HTML/CSS/JS) with a serverless **admin panel** backed by
**Vercel Postgres**. Products shown in the shop are stored in the database and
managed from `/admin`.

## How it fits together

| Part | Files |
|------|-------|
| Storefront pages | `index.html`, `sklep.html`, `produkt-*.html`, `koszyk.html`, … |
| Storefront logic | `js/main.js`, `js/products.js` |
| Admin panel UI | `admin.html`, `js/admin.js` |
| API (serverless) | `api/login.js`, `api/products/index.js`, `api/products/[id].js` |
| Shared server code | `api/_lib/*` (DB, auth, validation, seed data) |

- `js/products.js` fetches the catalog from `GET /api/products`. If the API is
  unreachable (e.g. the page is opened directly as a file, or the DB isn't
  attached yet), it falls back to the built-in `FALLBACK_PRODUCTS` list, so the
  shop always renders.
- The database table is created automatically on first request, and seeded once
  with the original 12 products.

## Deploy on Vercel

1. **Import the repo** into Vercel (Framework preset: **Other** — it's a static
   site with serverless functions, no build step).
2. **Attach a database:** Vercel dashboard → **Storage** → create a **Postgres**
   store and connect it to this project. Vercel injects `POSTGRES_URL` (and
   related vars) automatically — no manual config needed.
3. **Set environment variables** (Project → Settings → Environment Variables):
   - `ADMIN_PASSWORD` — the password for signing in to `/admin` (**required**).
   - `SESSION_SECRET` — optional; a long random string used to sign the session
     cookie. If unset, `ADMIN_PASSWORD` is used to derive the signing key.
4. **Deploy.** Visit `/admin`, sign in with `ADMIN_PASSWORD`, and manage
   products. Changes appear in the shop immediately (the storefront reads the
   same API).

## Local development

```bash
npm install
vercel env pull .env.local   # pull POSTGRES_URL etc. from your Vercel project
vercel dev                   # serves the static site + /api functions locally
```

Without a database connection the API returns a clear error and the storefront
uses its fallback catalog.

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/products` | public | List all products |
| `GET` | `/api/products/:id` | public | Single product |
| `POST` | `/api/products` | admin | Create a product |
| `PUT` | `/api/products/:id` | admin | Update a product |
| `DELETE` | `/api/products/:id` | admin | Delete a product |
| `GET` | `/api/login` | — | Session status `{ authed }` |
| `POST` | `/api/login` | — | Sign in with `{ password }` |
| `DELETE` | `/api/login` | — | Sign out |

Admin requests are authorized by an HttpOnly, `Secure`, `SameSite=Strict`
session cookie (valid 12h), signed with HMAC-SHA256.

## Product detail pages

- The original 12 products keep their hand-crafted static pages
  (`produkt-p01.html` … `produkt-p12.html`).
- Every product added through the admin panel gets a working detail page via the
  dynamic template **`produkt.html?id=<id>`** (`js/product-detail.js`), which
  loads the product from `GET /api/products/:id` and renders gallery, price,
  sizes, colors, description, add-to-cart, and related products.
- Product cards route automatically: ids matching `pNN` → static page, all
  others → the dynamic template.
- Products have an optional **description** field (editable in the admin panel);
  when empty, the page shows a generated fallback description.
- The admin panel lets you upload a **main product photo** and a **gallery** of
  extra photos (downscaled client-side and stored on the product). When no photo
  is uploaded the card/detail page falls back to a neutral tile.
- **Brand** is a free-text field with quick-pick suggestions (Nike, Adidas, Puma,
  Reebok, New Balance, Under Armour) — you can also type any other brand.

## Notes / possible next steps

- Scope today is **products**. Orders and stored contact-form submissions were
  intentionally left out.
- The 12 original static pages could be migrated onto `produkt.html?id=` too, so
  admin edits to those products reflect on their detail pages.
