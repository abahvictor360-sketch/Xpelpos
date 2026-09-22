// Xpel POS desktop shell — serves the exported Next bundle over a local
// http origin so service workers, IndexedDB and absolute /_next asset paths
// all behave exactly as they do in the browser build.
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { startUpdateChecks, checkWithFeedback } = require("./updater");

const ROOT = path.join(__dirname, "..", "out");

// The till's local database (Dexie/IndexedDB) lives under this folder. Pinning
// it keeps sales, stock and shifts in one predictable, backup-able place
// instead of wherever Chromium would otherwise put them.
const DATA_DIR = path.join(app.getPath("appData"), "Xpel POS", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
app.setPath("userData", DATA_DIR);

// One fixed origin for every launch, so IndexedDB always resolves to the same
// database no matter which port the internal server gets.
const PORT = 47615;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const target = path.normalize(path.join(ROOT, decoded));
  if (!target.startsWith(ROOT)) return null; // no escaping the bundle

  const candidates = [target, `${target}.html`, path.join(target, "index.html")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function startServer(attempt = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const file = resolveFile(pathname) || resolveFile("/404.html");
      if (!file) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.on("error", (error) => {
      // Something else holds the port. Step forward rather than refusing to
      // open the till; the database then lives under the new origin.
      if (error.code === "EADDRINUSE" && attempt < 10) {
        resolve(startServer(attempt + 1));
        return;
      }
      reject(error);
    });
    // 127.0.0.1 only: nothing is exposed to the network. A fixed port keeps
    // the browser origin stable so the local database survives restarts.
    server.listen(PORT + attempt, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function createWindow() {
  const port = await startServer();

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#ffffff",
    show: false,
    title: "Xpel POS",
    icon: path.join(__dirname, "..", "public", "icons", "icon-512.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
    startUpdateChecks();
  });
  win.loadURL(`http://127.0.0.1:${port}/`);

  // Ask the OS never to evict the till's data under disk pressure.
  win.webContents.once("did-finish-load", () => {
    win.webContents
      .executeJavaScript("navigator.storage && navigator.storage.persist && navigator.storage.persist()")
      .catch(() => undefined);
  });

  // External links open in the real browser, not inside the till.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

// Keep a slim menu: reload, zoom (receipt screens), devtools, quit.
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Check for updates",
          click: () => checkWithFeedback(BrowserWindow.getFocusedWindow()),
        },
        { type: "separator" },
        {
          label: "Open data folder",
          click: () => shell.openPath(app.getPath("userData")),
        },
        {
          label: "About local data",
          click: () =>
            dialog.showMessageBox({
              type: "info",
              title: "Xpel POS data",
              message: "Xpel POS keeps every sale, product, customer and shift on this PC.",
              detail:
                `Local database folder:
${app.getPath("userData")}

` +
                "The till works with no internet. When Supabase sync is configured, " +
                "records upload in the background; nothing is lost if the connection drops.",
            }),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
  ]),
);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
