const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');

// Settings are stored in localStorage in renderer, but we need the API base URL in main for proxying.
// We will pass the API URL with each IPC call.

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    }
  });

  // Load the built vite app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Custom protocol for serving local files or media if needed
  protocol.handle('app', (request) => {
    const url = request.url.slice('app://'.length);
    return net.fetch('file://' + path.join(__dirname, '../dist', url));
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('api-ping', async (event, baseUrl) => {
  if (!baseUrl || !baseUrl.startsWith('http')) return { ok: false, error: 'Invalid or missing API Base URL' };
  try {
    const res = await fetch(`${baseUrl}/openapi.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('api-submit-job', async (event, { baseUrl, files, fields }) => {
  try {
    const formData = new FormData();
    // Reconstruct File objects from buffer data
    if (files) {
      for (const [key, fileData] of Object.entries(files)) {
        if (fileData) {
          const blob = new Blob([fileData.buffer]);
          formData.append(key, blob, fileData.name);
        }
      }
    }
    if (fields) {
      for (const [key, val] of Object.entries(fields)) {
        if (val !== undefined && val !== null) {
          formData.append(key, val);
        }
      }
    }
    const res = await fetch(`${baseUrl}/api/v1/process`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('api-poll-job', async (event, { baseUrl, jobId }) => {
  try {
    const res = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('api-get-file', async (event, { baseUrl, relativePath }) => {
  try {
    // Return arraybuffer
    const res = await fetch(`${baseUrl}${relativePath}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return { ok: true, buffer: ab, type: res.headers.get('content-type') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
