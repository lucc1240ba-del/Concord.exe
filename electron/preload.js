const { contextBridge, ipcRenderer } = require("electron");

// contextIsolation: true + nodeIntegration: false — o frontend (app/index.html)
// NUNCA tem acesso direto a require, fs, process, ipcRenderer, etc.
// Só o que for explicitamente exposto aqui chega até ele, em window.concordDesktop.
contextBridge.exposeInMainWorld("concordDesktop", {
  isDesktopApp: true,
  platform: process.platform, // 'win32', 'darwin', 'linux' — útil pra ajustar UI se precisar
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  // Callback-only: o frontend recebe eventos de status de atualização, mas não
  // pode mandar nada de volta pro processo principal por aqui.
  onUpdateStatus: (callback) => {
    ipcRenderer.on("concord-update-status", (_event, payload) => callback(payload));
  },
  // Pede ao processo principal a lista de telas/janelas disponíveis para
  // compartilhar, com miniatura — usada pelo seletor customizado (estilo Discord).
  getScreenSources: () => ipcRenderer.invoke("get-screen-sources"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  quitAndInstall: () => ipcRenderer.send("quit-and-install"),
});
