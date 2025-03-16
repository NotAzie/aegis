/**
 * BrowserWindow Preload Script (Toolbar Chrome)
 * Exposes secure contextBridge IPC methods to the browser UI.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  navigate: (url) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getUa: () => ipcRenderer.send('get-ua'),
  setProxy: (config) => ipcRenderer.send('set-proxy', config),

  onNavState: (cb) => {
    ipcRenderer.on('nav-state', (_e, state) => cb(state));
  },
  onBlockedCount: (cb) => {
    ipcRenderer.on('blocked-count', (_e, count) => cb(count));
  },
  onProxyState: (cb) => {
    ipcRenderer.on('proxy-state', (_e, state) => cb(state));
  },
  onSecurityWarning: (cb) => {
    ipcRenderer.on('security-warning', (_e, warning) => cb(warning));
  },
  onCertificateError: (cb) => {
    ipcRenderer.on('certificate-error', (_e, err) => cb(err));
  },
  onWebrtcMode: (cb) => {
    ipcRenderer.on('webrtc-mode', (_e, mode) => cb(mode));
  },
  onUaInfo: (cb) => {
    ipcRenderer.on('ua-info', (_e, ua) => cb(ua));
  }
});
