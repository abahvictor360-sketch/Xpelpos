// A plain-text log on disk, written by the main process.
//
// The till's own Activity Log lives in the database. That is the wrong place to
// look when the question is "did the database work at all" — if it failed, the
// record of the failure failed with it. This log sits outside the database, in
// a file, so there is always something to read afterwards.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const MAX_FILES = 30;

let logDir = null;
let stream = null;
let streamDay = null;

function directory() {
  if (!logDir) {
    logDir = path.join(app.getPath("appData"), "Xpel POS", "logs");
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** One file per day, reopened when the date rolls over mid-shift. */
function fileStream() {
  const day = today();
  if (stream && streamDay === day) return stream;

  if (stream) stream.end();
  streamDay = day;
  stream = fs.createWriteStream(path.join(directory(), `xpel-pos-${day}.log`), { flags: "a" });
  return stream;
}

/** Keeps a month of logs; a till left running for a year should not fill the disk. */
function prune() {
  try {
    const files = fs
      .readdirSync(directory())
      .filter((name) => name.startsWith("xpel-pos-") && name.endsWith(".log"))
      .sort();
    for (const name of files.slice(0, Math.max(0, files.length - MAX_FILES))) {
      fs.unlinkSync(path.join(directory(), name));
    }
  } catch {
    // Housekeeping only.
  }
}

function log(level, message, detail) {
  try {
    const line = [
      new Date().toISOString(),
      level.toUpperCase().padEnd(5),
      message,
      detail === undefined ? "" : typeof detail === "string" ? detail : JSON.stringify(detail),
    ]
      .join(" | ")
      .trimEnd();

    fileStream().write(`${line}\n`);
  } catch {
    // Logging must never be the reason the till stops.
  }
}

/** Records what the renderer prints, so a failed sale leaves a trace on disk. */
function attachRenderer(contents) {
  contents.on("console-message", (_event, level, message, line, sourceId) => {
    // 0 log, 1 warning, 2 error. Warnings and errors always; the app's own
    // "[xpel]" lines carry the sale and stock events worth keeping.
    const isAppEvent = typeof message === "string" && message.startsWith("[xpel]");
    if (level < 1 && !isAppEvent) return;

    log(level >= 2 ? "error" : isAppEvent ? "info" : "warn", message,
      sourceId ? `${sourceId}:${line}` : undefined);
  });

  contents.on("render-process-gone", (_event, details) => {
    log("error", "Renderer stopped", details);
  });

  contents.on("unresponsive", () => log("warn", "Window stopped responding"));

  contents.on("did-fail-load", (_event, code, description, url) => {
    log("error", "Page failed to load", { code, description, url });
  });
}

module.exports = { log, attachRenderer, prune, directory };
