const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 920,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile('dist/index.html');
  }

  // Window bounds IPC handlers for edge drag-resizing
  ipcMain.handle('window-get-bounds', () => {
    return !win.isDestroyed() && win.getBounds();
  });

  ipcMain.on('window-set-bounds', (_event, bounds) => {
    if (!win.isDestroyed() && bounds) {
      win.setBounds(bounds);
    }
  });

  // Push window maximize state changes to renderer for seamless synchronization
  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-maximized-changed', true);
    }
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-maximized-changed', false);
    }
  });

  win.on('restore', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-maximized-changed', false);
    }
  });

  // Window control IPC handlers
  ipcMain.on('window-minimize', () => {
    if (!win.isDestroyed()) {
      win.minimize();
    }
  });

  ipcMain.on('window-maximize', () => {
    if (!win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (!win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.handle('window-is-maximized', () => {
    return !win.isDestroyed() && win.isMaximized();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
