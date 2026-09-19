const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer } = require("electron");
const path = require("path");

// Evita segundo processo — clicar no atalho de novo só foca a janela existente
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#1c1e21", // mesmo --bg-app do Concord, evita flash branco no boot
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  // Frontend empacotado localmente dentro do instalador — nunca abre a URL da Vercel.
  mainWindow.loadFile(path.join(__dirname, "..", "app", "index.html"));

  // Qualquer link que o app tente abrir em nova janela vai pro navegador do sistema,
  // em vez de abrir dentro do Electron (evita virar um mini-navegador descontrolado).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Lista telas e janelas abertas com miniatura, pro app desenhar seu próprio seletor
// de compartilhamento (estilo Discord) em vez do picker genérico do navegador.
// Só devolve o que é necessário pra montar a grade (id, nome, thumbnail em base64);
// nunca expõe o objeto bruto do desktopCapturer nem qualquer API do Node ao renderer.
ipcMain.handle("get-screen-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.id.startsWith("screen:") ? "screen" : "window",
    thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});

app.whenReady().then(() => {
  createWindow();

  // ---- Auto-update via GitHub Releases ----
  // Lê `build.publish` do package.json (owner/repo), compara a versão instalada
  // (app.getVersion()) com o `latest.yml` do release mais recente. Se houver uma
  // nova, baixa o instalador em background; o usuário só precisa fechar e abrir
  // o app de novo pra aplicar (ou reiniciar quando o download terminar).
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    if (mainWindow) mainWindow.webContents.send("concord-update-status", { status: "available", version: info.version });
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow) mainWindow.webContents.send("concord-update-status", { status: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err == null ? "unknown" : (err.stack || err).toString());
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("checkForUpdatesAndNotify failed:", err);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
