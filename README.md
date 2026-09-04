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

## Notes / possible next steps

- Individual `produkt-pXX.html` detail pages are still static. The shop grid,
  homepage, and "related products" are all DB-driven. Making detail pages fully
  dynamic (one template reading `?id=`) is a natural follow-up.
- Scope today is **products**. Orders and stored contact-form submissions were
  intentionally left out.
