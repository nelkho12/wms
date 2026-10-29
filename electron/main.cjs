// ApexWMS desktop shell: shows the built screens in a normal Windows application window.
// All data lives on the ApexWMS service (next to SQL Server); this app only displays it.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'ApexWMS',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Links to websites open in the normal browser, never inside this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    dialog.showErrorBox('ApexWMS', `The application screens could not be loaded (${desc}). Please reinstall ApexWMS.`);
  });
}

function buildMenu() {
  const template = [
    {
      label: 'ApexWMS',
      submenu: [
        { label: 'Reload', accelerator: 'F5', click: () => win && win.reload() },
        {
          label: 'Change service address / sign in again',
          click: () => {
            if (!win) return;
            // Forget the saved address and login, then reload to the sign-in screen.
            win.webContents
              .executeJavaScript("localStorage.removeItem('wms_server_url'); localStorage.removeItem('wms_token');")
              .then(() => win.reload());
          }
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
