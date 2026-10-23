const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  api: {
    ping: (baseUrl) => ipcRenderer.invoke('api-ping', baseUrl),
    submitJob: (baseUrl, files) => ipcRenderer.invoke('api-submit-job', { baseUrl, files }),
    pollJob: (baseUrl, jobId) => ipcRenderer.invoke('api-poll-job', { baseUrl, jobId }),
    getFile: (baseUrl, relativePath) => ipcRenderer.invoke('api-get-file', { baseUrl, relativePath })
  }
});
