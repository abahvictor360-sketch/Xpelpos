// Keeps an installed till current. electron-updater checks the GitHub release
// feed, downloads a newer build in the background, and installs it on quit —
// so a shop that never touches git still picks up changes.
const { app, dialog, Notification } = require("electron");

// Re-check while the app stays open for days at a time, as tills do.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let autoUpdater = null;
let checking = false;

function loadUpdater() {
  if (autoUpdater) return autoUpdater;
  ({ autoUpdater } = require("electron-updater"));

  autoUpdater.autoDownload = true;
  // Never interrupt a sale: the new version goes in when the app closes.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on("error", () => {
    // Offline or GitHub unreachable is the normal case for a shop with a bad
    // line. Stay quiet and try again on the next interval.
    checking = false;
  });

  autoUpdater.on("update-not-available", () => {
    checking = false;
  });

  autoUpdater.on("update-downloaded", (info) => {
    checking = false;
    if (Notification.isSupported()) {
      new Notification({
        title: "Xpel POS update ready",
        body: `Version ${info.version} installs the next time you close the till.`,
      }).show();
    }
  });

  return autoUpdater;
}

function checkQuietly() {
  if (!app.isPackaged || checking) return;
  checking = true;
  loadUpdater()
    .checkForUpdates()
    .catch(() => {
      checking = false;
    });
}

// The manual "Check for updates" menu item, which does report back either way.
async function checkWithFeedback(win) {
  if (!app.isPackaged) {
    await dialog.showMessageBox(win, {
      type: "info",
      title: "Updates",
      message: "Updates only apply to an installed copy of Xpel POS.",
      detail: "You are running the app from the project folder.",
    });
    return;
  }

  try {
    const result = await loadUpdater().checkForUpdates();
    const version = result && result.updateInfo && result.updateInfo.version;

    if (!version || version === app.getVersion()) {
      await dialog.showMessageBox(win, {
        type: "info",
        title: "Updates",
        message: "Xpel POS is up to date.",
        detail: `You are on version ${app.getVersion()}.`,
      });
      return;
    }

    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "Update available",
      message: `Version ${version} is downloading in the background.`,
      detail:
        "It installs when you close the till. You can keep selling in the meantime.",
      buttons: ["OK", "Install and restart now"],
      defaultId: 0,
      cancelId: 0,
    });

    if (response === 1) {
      loadUpdater().once("update-downloaded", () => {
        loadUpdater().quitAndInstall();
      });
    }
  } catch {
    await dialog.showMessageBox(win, {
      type: "warning",
      title: "Updates",
      message: "Could not reach the update server.",
      detail: "Check the internet connection and try again.",
    });
  }
}

function startUpdateChecks() {
  if (!app.isPackaged) return;
  // Give the till a moment to open before touching the network.
  setTimeout(checkQuietly, 15_000);
  setInterval(checkQuietly, CHECK_INTERVAL_MS);
}

module.exports = { startUpdateChecks, checkWithFeedback };
