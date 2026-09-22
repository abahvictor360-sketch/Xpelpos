# Xpel POS on Windows

The till ships as a Windows desktop app. Electron hosts the same Next.js UI the
web build serves, so there is one codebase and one set of screens.

## Building it

```bash
npm install
npm run dist
```

That runs two steps:

1. `npm run export:desktop` — `next build` with `DESKTOP_BUILD=1`, which turns on
   `output: "export"` and writes a fully static bundle to `out/`.
2. `electron-builder --win` — packages `out/` plus `electron/main.js` into:
   - `release/Xpel POS Setup 1.0.0.exe` — NSIS installer, per-user, lets the
     operator choose the install folder, creates desktop and Start menu shortcuts.
   - `release/Xpel-POS-1.0.0-portable.exe` — single file, runs with no install.
   - `release/win-unpacked/` — the unpacked app, handy for testing.

`npm run electron` builds the bundle and opens it without packaging.

The web build is untouched: without `DESKTOP_BUILD=1`, `next build` behaves
exactly as before, so Vercel deploys are unaffected.

## How the shell works

`electron/main.js` starts a tiny HTTP server bound to `127.0.0.1` and points the
window at it. Serving over `http://` rather than `file://` is what keeps the
service worker, IndexedDB and Next's absolute `/_next/...` asset paths working.
Nothing is exposed beyond the loopback interface.

The port is fixed at `47615` so the browser origin — and therefore the local
database — is identical on every launch. If another program already holds that
port, the shell steps forward to the next free one.

## The local database

Sales, products, customers, shifts, stock movements, coupons and held sales are
stored in a Dexie/IndexedDB database named `xpel-pos`, on the PC itself. The app
pins its data folder to:

```
%APPDATA%\Xpel POS\data
```

`File > Open data folder` in the app menu opens it, and `File > About local data`
shows the path. Back up that folder to back up the till.

At startup the app calls `navigator.storage.persist()`, so Windows will not evict
the data under disk pressure. Only one instance runs at a time, so two windows
can never write to the same database.

Supabase sync stays optional. With no network, the till keeps selling from the
local database; when sync is configured and the connection returns, records
upload in the background.

## Updates

Installed copies update themselves. The app reads the GitHub release feed for
this repository, downloads a newer build in the background, and installs it when
the till is closed, so a sale is never interrupted. `File > Check for updates`
forces a check and offers an immediate restart.

Shipping a new version takes three steps:

1. Bump `version` in `package.json`.
2. `npm run dist`.
3. Create a GitHub release tagged `v<version>` and attach **all three** files
   from `release/`: the installer, the portable build, and `latest.yml`.

`latest.yml` is the feed — without it, installed tills have no way to learn that
a new version exists. The installer filename must stay exactly as
electron-builder writes it, since the feed refers to it by name.

Only the installed (NSIS) build updates itself. The portable exe is a single
file with nowhere to install to, so it has to be re-downloaded by hand.

Offline tills simply skip the check and try again later.

## The download page

`/download` is the public landing page where staff get the Windows build. Its
links are configured in `src/lib/download-config.ts` and can be overridden
without a code change:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_POS_VERSION` | Version shown on the page |
| `NEXT_PUBLIC_POS_INSTALLER_URL` | Installer download link |
| `NEXT_PUBLIC_POS_PORTABLE_URL` | Portable build download link |

By default they point at the latest GitHub release of this repository, so
publishing a release with both `.exe` files attached is enough to make the page
live.
