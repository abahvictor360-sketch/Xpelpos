# Xpel POS — Xpel Beauty NG

An offline-first point of sale for Xpel Beauty NG. The cashier types the first few
letters of a product, the app suggests matches, items go into a cart, and the sale is
closed with **cash, transfer or card**. Everything is written to the device first and
synced to Supabase in the background, so the till keeps working when the network drops.

## What it does

- **Fast product lookup** — type 3 letters, arrow keys to choose, `Enter` to add. Matches
  name, SKU, category, brand and barcode.
- **Multi-item cart** — quantities, per-line totals, discount, amount collected and
  automatic change calculation.
- **Payment methods** — cash, bank transfer or card, recorded per sale.
- **Receipts** — on-screen receipt with a print button (works with A4 and thermal printers
  through the browser print dialog).
- **Inventory** — add products with opening quantity, edit prices, restock, low-stock and
  out-of-stock alerts, stock value, inventory export.
- **Sales & reports** — filter by date range and payment method, void a sale (stock goes
  back), and export to **Excel (.xlsx), PDF (.pdf) and Word (.docx)**.
- **Analytics** — revenue trend, gross profit, average basket, best-selling products and
  payment-method split for 7 / 30 / 90 days.
- **Offline first** — IndexedDB (Dexie) is the source of truth; a background sync pushes
  pending rows to Supabase and pulls changes from other devices every 2 minutes, when the
  connection returns, and on demand.
- **Installable** — a PWA with a service worker, so it installs on **Windows** (Edge/Chrome)
  and **Android** (Chrome) and runs in its own window.

## Running locally

```bash
npm install
cp .env.example .env.local   # add your Supabase URL + publishable key
npm run dev                  # http://localhost:3000
```

Open **Settings → Load sample products** to try it with a demo catalogue.

## Installing on a device

Open the deployed URL and use the **Install app** button in the header (or on the
Settings page). It replays the browser's own install prompt; where the browser has no
such prompt it shows the manual steps for that platform.

| Platform | How |
| --- | --- |
| Windows PC | Edge or Chrome → **Install app** button, or the install icon in the address bar (menu → Apps → *Install this site as an app*). |
| Android | Chrome → **Install app** button, or ⋮ menu → *Add to Home screen*. |
| iPhone / iPad | Safari → Share → *Add to Home Screen* (iOS has no install prompt API). |

Once installed the app launches full screen, keeps its local database, and works with no
internet connection. Sales made offline upload the next time the device is online.

## Cloud sync

Sync needs a Supabase account to be signed in once per device (**Settings → Cloud sync**).
Local data is never blocked by this — an unsigned device still records sales, and they
upload when someone signs in.

Tables used (created by the migrations in `supabase/migrations`):

| Table | Holds |
| --- | --- |
| `pos_products` | catalogue and stock levels |
| `pos_sales` | one row per completed sale |
| `pos_sale_items` | the lines of each sale |
| `pos_stock_movements` | every stock change with its reason |

Row-level security is on; only authenticated users can read or write.

Conflict handling is last-write-wins on `updated_at`, and a device never overwrites its own
unsynced edits with a remote copy.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Dexie (IndexedDB) ·
Supabase · Recharts · SheetJS · jsPDF · docx.

## Environment variables

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
