/**
 * main.js — PrivacyBrowser V2 Reactive Entry Point
 * Powered by NexusCore Unified Engine
 */

const { app } = require('electron');
const { Nexus } = require('./core/nexus');

const nexus = new Nexus();

app.whenReady().then(async () => {
  await nexus.boot();
});

app.on('before-quit', async (e) => {
  e.preventDefault();
  await nexus.shutdown();
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
