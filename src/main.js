/**
 * main.js — PrivacyBrowser (Prototype v0.1)
 * Initial proof of concept for an Electron privacy browser.
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let blockedCount = 0;
const TRACKER_DOMAINS = new Set([
  'google-analytics.com',
  'doubleclick.net',
  'facebook.net',
  'scorecardresearch.com',
  'criteo.com',
  'adnxs.com'
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1a1a1a',
    title: 'PrivacyBrowser',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Intercept requests and block trackers
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    try {
      const url = new URL(details.url);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (TRACKER_DOMAINS.has(host)) {
        console.log('[Blocked tracker]:', details.url);
        blockedCount++;
        return callback({ cancel: true });
      }
    } catch (e) {}
    callback({ cancel: false });
  });

  mainWindow.loadURL('https://duckduckgo.com');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Navigation event handler stub
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function loadSeedBlocklist() {
  const p = path.join(__dirname, 'blocklists', 'trackers.txt');
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(l => {
      const t = l.trim().toLowerCase();
      if (t && !t.startsWith('#')) TRACKER_DOMAINS.add(t);
    });
  }
}
loadSeedBlocklist();

function normaliseInput(input) {
  const t = input.trim();
  if (!t) return 'https://duckduckgo.com';
  if (/^https?:\/\//i.test(t)) return t;
  if (!t.includes(' ') && t.includes('.')) return 'https://' + t;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(t);
}

// Window sizing bounds
const MIN_WINDOW_WIDTH = 600;
const MIN_WINDOW_HEIGHT = 400;

// Anti-white flash on launch
// mainWindow.setBackgroundColor('#121212');

function getBlockedStats() { return { blockedCount }; }
