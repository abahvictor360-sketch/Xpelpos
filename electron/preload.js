// Bridge between the till's web UI and the desktop shell. Exposes printer
// listing and direct printing, so a receipt can go straight to the shop's
// receipt printer without the print dialog every time.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("xpelDesktop", {
  listPrinters: () => ipcRenderer.invoke("xpel:list-printers"),
  print: (options) => ipcRenderer.invoke("xpel:print", options),
});
