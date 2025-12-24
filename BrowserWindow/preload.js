const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  navigate: (url) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  onNavState: (cb) => {
    ipcRenderer.on('nav-state', (_e, state) => cb(state));
  },
  onNexusTelemetry: (cb) => {
    ipcRenderer.on('nexus-telemetry', (_e, telemetry) => cb(telemetry));
  },
  onBlockedCount: (cb) => {
    ipcRenderer.on('blocked-count', (_e, count) => cb(count));
  }
});
