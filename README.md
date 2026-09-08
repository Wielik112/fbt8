# FBT Outlet

Static storefront (HTML/CSS/JS) with a serverless **admin panel** backed by
**Vercel Postgres**. Products shown in the shop are stored in the database and
managed from `/admin`.

## How it fits together

| Part | Files |
|------|-------|
| Storefront pages | `index.html`, `sklep.html`, `produkt-*.html`, `koszyk.html`, … |
| Storefront logic | `js/main.js`, `js/products.js` |
| Admin panel UI | `admin.html`, `js/admin.js` (Products + Orders tabs) |
| Checkout | `koszyk.html` → `zamowienie.html` (`js/checkout.js`) → Stripe → `dziekujemy.html` |
| API (serverless) | `api/login.js`, `api/products/*`, `api/checkout.js`, `api/stripe-webhook.js`, `api/orders/*`, `api/order-status.js`, `api/health.js` |
| Shared server code | `api/_lib/*` (db, auth, validation, seed, `commerce`, `stripe`, `orders`) |

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
| `POST` | `/api/checkout` | public | Re-price cart, create order + Stripe session |
| `POST` | `/api/stripe-webhook` | Stripe sig | Payment confirmation (source of truth) |
| `GET` | `/api/order-status?session_id=` | public | Buyer confirmation summary |
| `GET` | `/api/orders` | admin | List orders (`?status=&limit=&offset=&stats=1`) |
| `GET` | `/api/orders/:id` | admin | Full order detail |
| `PATCH` | `/api/orders/:id` | admin | Update status / tracking / notes |
| `POST` | `/api/orders/:id/shipment` | admin | Create an InPost shipment |
| `GET` | `/api/orders/:id/shipment` | admin | Refresh InPost shipment status |
| `GET` | `/api/orders/:id/label` | admin | InPost label PDF (`?type=A6\|normal`) |
| `GET` | `/api/health` | public | DB + config diagnostics (names only) |

Admin requests are authorized by an HttpOnly, `Secure`, `SameSite=Strict`
session cookie (valid 12h), signed with HMAC-SHA256; a bearer token is also
accepted as a same-origin fallback.

## Payments & orders (Stripe)

Checkout uses **Stripe Checkout** (hosted, redirect) in **PLN** with **card,
BLIK and Przelewy24**. The design keeps the shop as the source of truth:

- **Server-side pricing.** `POST /api/checkout` ignores any prices sent by the
  browser and re-reads every product's price from the database, recomputes the
  subtotal, applies shipping and any (server-validated) discount code, and only
  then creates the Stripe session. The client cannot influence what is charged.
- **The webhook is the source of truth for "paid".** `POST /api/stripe-webhook`
  verifies the Stripe signature against `STRIPE_WEBHOOK_SECRET` and marks the
  order paid. Marking is idempotent, so repeated deliveries are safe. Async
  methods (P24) are settled on `async_payment_succeeded`.
- **Immutable order record.** Each order snapshots its line items and prices, so
  later product edits never change a historical order. All money is stored in
  grosze (integers).
- **Flow:** `koszyk.html` → `zamowienie.html` (contact, delivery, summary) →
  Stripe → `dziekujemy.html?session_id=…` (polls `/api/order-status` until the
  webhook confirms payment, then clears the cart).

Manage orders in **/admin → Zamówienia**: list + status filter, revenue and
to-fulfil stats, and a detail view where you set the fulfilment status, add a
tracking number, and leave internal notes.

### Stripe setup

1. Create a Stripe account; enable **card, BLIK, Przelewy24** (Settings → Payment
   methods). Use **test mode** first.
2. Set env vars in Vercel: `STRIPE_SECRET_KEY` (`sk_test_…`), and after step 3
   `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
3. Add a webhook endpoint → `https://<your-domain>/api/stripe-webhook`, subscribe
   to: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Redeploy. Test with Stripe test cards / the BLIK test flow. Switch to live
   keys when ready.

The webhook route reads the **raw request body** (needed for signature
verification) via `export const config = { api: { bodyParser: false } }`.

## Shipping & InPost

Shipping methods and prices live in `api/_lib/commerce.js` (`SHIPPING_METHODS`,
`FREE_SHIPPING_THRESHOLD`) — the server-authoritative config:

- **InPost Paczkomat 24/7** (parcel locker, requires a point) — 12,99 zł
- **Kurier InPost** — 15,99 zł
- **Kurier standardowy** — 19,99 zł
- Free shipping from **300 zł**.

### InPost shipping labels (ShipX)

The full fulfilment loop is wired via **InPost ShipX** (`api/_lib/inpost.js`):

1. Order is paid → shows in **/admin → Zamówienia** as *Opłacone*.
2. Open the order → **Przesyłka InPost**: pick the parcel size (Gabaryt A/B/C,
   plus weight for courier) → **Utwórz przesyłkę InPost**. The server calls
   ShipX, creates the shipment, and stores its id + **tracking number** on the
   order.
3. **Etykieta A6 / A4** downloads the label **PDF** to print.
4. Stick the label on the parcel and drop it in any Paczkomat (locker) or hand
   it to the InPost courier. **Odśwież status** re-polls ShipX.

The customer gets InPost tracking + notifications automatically — nothing is
sent by hand. Only **InPost Paczkomat** and **Kurier InPost** orders get a label
(the generic *Kurier* method is a non-InPost carrier you handle yourself).

**Setup:** set `INPOST_SHIPX_TOKEN`, `INPOST_ORG_ID` and `INPOST_ENV`
(`sandbox` → `production`) in the Vercel env. Get the API token + organization
id from the InPost manager (API / ShipX section). For the checkout **map**
picker, also set the public `inpostGeowidgetToken` in `js/config.js`; with no
token, checkout falls back to manual Paczkomat code entry.

Endpoints: `POST /api/orders/:id/shipment` (create), `GET
/api/orders/:id/shipment` (refresh status), `GET /api/orders/:id/label?type=A6|normal`
(label PDF) — all admin-only.

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
