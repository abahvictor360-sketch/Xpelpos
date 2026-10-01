// Xpel POS desktop shell — serves the exported Next bundle over a local
// http origin so service workers, IndexedDB and absolute /_next asset paths
// all behave exactly as they do in the browser build.
const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { startUpdateChecks, checkWithFeedback } = require("./updater");
const logger = require("./logger");

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
      let file = resolveFile(pathname);

      if (!file) {
        // Only a page request may fall back to the 404 page. An asset must
        // answer 404, because handing HTML back for a missing .js file makes
        // the browser parse a web page as JavaScript, and the app dies with
        // "Unexpected token '<'" instead of saying what is wrong.
        const isAsset = pathname.startsWith("/_next/") || path.extname(pathname) !== "";
        file = isAsset ? null : resolveFile("/404.html");
      }

      if (!file) {
        res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
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

// Printers installed on this PC, so Settings can offer the receipt printer by name.
ipcMain.handle("xpel:list-printers", async (event) => {
  const printers = await event.sender.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: Boolean(printer.isDefault),
  }));
});

// Prints the page as the receipt print stylesheet lays it out. With a printer
// chosen in Settings it goes straight there; otherwise the print dialog opens.
// Thermal rolls get a page exactly as wide as the roll and as long as the receipt.
ipcMain.handle("xpel:print", (event, options = {}) => {
  const settings = {
    silent: Boolean(options.silent && options.deviceName),
    printBackground: true,
    margins: { marginType: "none" },
  };
  if (options.deviceName) settings.deviceName = options.deviceName;
  if (options.pageWidthMicrons && options.pageHeightMicrons) {
    settings.pageSize = {
      width: Math.max(Math.round(options.pageWidthMicrons), 353),
      height: Math.max(Math.round(options.pageHeightMicrons), 353),
    };
  }
  return new Promise((resolve) => {
    event.sender.print(settings, (ok, reason) => {
      if (!ok) logger.log("warn", "Print did not complete", { reason, deviceName: options.deviceName });
      resolve({ ok, reason: ok ? undefined : reason });
    });
  });
});

async function createWindow() {
  const port = await startServer();

  logger.log("info", "Till opened", {
    version: app.getVersion(),
    port,
    data: app.getPath("userData"),
  });

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
      preload: path.join(__dirname, "preload.js"),
    },
  });

  logger.attachRenderer(win.webContents);

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
          label: "Open log folder",
          click: () => shell.openPath(logger.directory()),
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
  app.whenReady().then(() => {
    logger.prune();
    createWindow();
  });

  app.on("before-quit", () => logger.log("info", "Till closing"));
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
