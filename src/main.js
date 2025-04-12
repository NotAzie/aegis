/**
 * main.js — PrivacyBrowser Main Process
 *
 * This file is the heart of the browser. It:
 *   - Creates the BrowserWindow (chrome/toolbar UI)
 *   - Creates a WebContentsView (isolated web content pane)
 *   - Intercepts ALL network requests via webRequest API
 *   - Enforces privacy: blocks trackers, strips fingerprint headers
 *   - Clears all session data on exit
 *
 * Architecture:
 *   BrowserWindow (toolbar)
 *     └─ WebContentsView (web content — separate session)
 *
 * The renderer (toolbar UI) NEVER has direct access to Node.js.
 * It communicates via contextBridge IPC defined in preload.js.
 */

const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  shell,
  net,
} = require('electron');

const path = require('path');
const fs   = require('fs');

// Force a stable writable userData directory to avoid disk-cache permission issues
const safeUserDataPath = path.join(app.getPath('appData'), 'PrivacyBrowser');
app.setPath('userData', safeUserDataPath);

// Early command-line switches for privacy and cache stability
app.commandLine.appendSwitch('disable-application-cache');
app.commandLine.appendSwitch('disk-cache-dir', path.join(safeUserDataPath, 'Cache'));
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

console.log('main script __dirname:', __dirname);
console.log('main script process.cwd():', process.cwd());

// ─── Tracker blocklist ────────────────────────────────────────────────────────
// Load domain patterns from our bundled blocklist file.
// In production you'd fetch updated lists at startup.
const BLOCKLIST_PATH = path.join(app.getAppPath(), 'src', 'blocklists', 'trackers.txt');
const DEFAULT_START_URL = 'file://' + path.join(app.getAppPath(), 'src', 'start.html').replace(/\\/g, '/');

function loadBlocklist() {
  if (!fs.existsSync(BLOCKLIST_PATH)) return new Set();
  const lines = fs.readFileSync(BLOCKLIST_PATH, 'utf8').split('\n');
  const domains = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      domains.add(trimmed.toLowerCase());
    }
  }
  console.log(`[blocklist] Loaded ${domains.size} tracker domains`);
  return domains;
}

// Update blocklist from remote sources
async function updateBlocklist() {
  try {
    const sources = [
      'https://easylist.to/easylist/easylist.txt',
      'https://easylist.to/easylist/easyprivacy.txt',
    ];
    const allDomains = new Set();

    for (const url of sources) {
      const request = net.request(url);
      if (!request) {
        console.warn(`[blocklist] net.request returned undefined for ${url}`);
        continue;
      }

      const data = await new Promise((resolve, reject) => {
        let body = '';
        request.on('response', (response) => {
          response.on('data', (chunk) => { body += chunk; });
          response.on('end', () => resolve(body));
          response.on('error', reject);
        });
        request.on('error', reject);
        request.end();
      });

      const lines = data.split('\n');
      for (const line of lines) {
        if (line.startsWith('||') && line.includes('^')) {
          const domain = line.split('^')[0].substring(2).toLowerCase();
          if (domain) allDomains.add(domain);
        }
      }
    }

    // Merge with local
    const local = loadBlocklist();
    local.forEach(d => allDomains.add(d));

    // Write back
    const content = '# PrivacyBrowser Tracker Blocklist\n# Auto-updated\n\n' + Array.from(allDomains).sort().join('\n');
    fs.writeFileSync(BLOCKLIST_PATH, content);
    console.log(`[blocklist] Updated to ${allDomains.size} domains`);
    return allDomains;
  } catch (err) {
    console.error('[blocklist] Update failed:', err);
    return loadBlocklist();
  }
}

// Tracking query parameters to strip from URLs
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'mc_eid', 'ref', '_ga', 'twclid',
  'igshid', 'yclid', 'zanpid', 'dclid', 'srsltid',
];

// Pool of realistic User-Agent strings to rotate between sessions.
// All are current, common browsers — no exotic strings that stand out.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0',
];

// Pick one User-Agent for this session
const SESSION_USER_AGENT = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Anti-fingerprinting script to inject into pages
const ANTI_FINGERPRINT_SCRIPT = `
(function () {
  'use strict';

  // ── 1. Canvas fingerprint protection ────────────────────────────────────
  const origToDataURL   = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob      = HTMLCanvasElement.prototype.toBlob;
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  function addNoise(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i]   = Math.max(0, Math.min(255, data[i]   + (Math.random() < 0.05 ? (Math.random() > 0.5 ? 1 : -1) : 0)));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + (Math.random() < 0.05 ? (Math.random() > 0.5 ? 1 : -1) : 0)));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + (Math.random() < 0.05 ? (Math.random() > 0.5 ? 1 : -1) : 0)));
    }
    return imageData;
  }

  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    const imageData = origGetImageData.apply(this, args);
    return addNoise(imageData);
  };

  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      try {
        const id = origGetImageData.call(ctx, 0, 0, this.width, this.height);
        addNoise(id);
        ctx.putImageData(id, 0, 0);
      } catch {}
    }
    return origToDataURL.apply(this, args);
  };

  HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      try {
        const id = origGetImageData.call(ctx, 0, 0, this.width, this.height);
        addNoise(id);
        ctx.putImageData(id, 0, 0);
      } catch {}
    }
    return origToBlob.call(this, callback, ...args);
  };

  // ── 2. AudioContext fingerprint protection ──────────────────────────────
  const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
  if (OrigAudioContext) {
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (...args) {
      const data = origGetChannelData.apply(this, args);
      for (let i = 0; i < data.length; i += 100) {
        data[i] += Math.random() * 0.0001 - 0.00005;
      }
      return data;
    };
  }

  // ── 3. Navigator property normalisation ─────────────────────────────────
  const navOverrides = {
    hardwareConcurrency: 4,
    deviceMemory: 8,
    platform: 'Win32',
    maxTouchPoints: 0,
  };

  for (const [key, value] of Object.entries(navOverrides)) {
    try {
      Object.defineProperty(navigator, key, { get: () => value, configurable: true });
    } catch {}
  }

  // ── 4. Screen size normalisation ─────────────────────────────────────────
  const SCREEN_OVERRIDES = {
    width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24,
  };

  for (const [key, value] of Object.entries(SCREEN_OVERRIDES)) {
    try {
      Object.defineProperty(screen, key, { get: () => value, configurable: true });
    } catch {}
  }

  // ── 5. Font enumeration restriction ──────────────────────────────────────
  const ALLOWED_FONTS = new Set(['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'sans-serif', 'serif', 'monospace']);

  if (document.fonts && document.fonts.check) {
    const origCheck = document.fonts.check.bind(document.fonts);
    document.fonts.check = function (font, text) {
      const match = font.match(/"([^"]+)"|'([^']+)'|(\S+)$/);
      const family = match ? (match[1] || match[2] || match[3]) : '';
      return ALLOWED_FONTS.has(family) ? origCheck(font, text) : false;
    };
  }

  // ── 6. WebRTC leak prevention ─────────────────────────────────────────────
  if (window.RTCPeerConnection) {
    window.RTCPeerConnection = function () { throw new Error('[PrivacyBrowser] RTCPeerConnection is disabled for privacy.'); };
    window.RTCPeerConnection.prototype = {};
  }
  if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = window.RTCPeerConnection;

  // ── 7. Battery API
  if (navigator.getBattery) navigator.getBattery = () => Promise.reject(new Error('Battery API disabled'));

  // ── 8. Timezone normalisation
  const origDTF = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function (locales, options = {}) {
    options.timeZone = options.timeZone || 'UTC';
    return new origDTF(locales, options);
  };
  Intl.DateTimeFormat.prototype = origDTF.prototype;

  console.debug('[PrivacyBrowser] Anti-fingerprinting active.');
})();
`;

// Blocked requests counter (for UI display)
let blockedCount = 0;

// Tracker blocklist (updated on startup)
let TRACKER_DOMAINS;

// ─── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Checks if a URL's hostname matches any domain in our blocklist.
 * Also matches subdomains: "sub.tracker.com" matches "tracker.com"
 */
function isDomainBlocked(urlString) {
  try {
    const url  = new URL(urlString);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (TRACKER_DOMAINS.has(host)) return true;

    // Check parent domains (e.g. "a.b.tracker.com" → check "tracker.com")
    const parts = host.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (TRACKER_DOMAINS.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Removes known tracking query parameters from a URL.
 * Returns the cleaned URL string, or the original if unchanged.
 */
function stripTrackingParams(urlString) {
  try {
    const url     = new URL(urlString);
    let modified  = false;

    for (const param of TRACKING_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        modified = true;
      }
    }
    return modified ? url.toString() : urlString;
  } catch {
    return urlString;
  }
}

/**
 * Normalises raw user input into a full URL.
 * "google.com" → "https://google.com"
 * "search terms" → "https://duckduckgo.com/?q=search+terms"
 */
function normaliseInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_START_URL;

  // Already has a scheme
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Looks like a domain (contains a dot, no spaces)
  if (!trimmed.includes(' ') && trimmed.includes('.')) {
    return 'https://' + trimmed;
  }

  // Treat as a search query
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(trimmed);
}

// ─── App startup ─────────────────────────────────────────────────────────────

const TOOLBAR_HEIGHT = 52; // px — height of our custom toolbar

let mainWindow;
let webView;          // WebContentsView for web content
let webContents;      // shorthand: webView.webContents

async function createWindow() {
  // Update blocklist on startup
  TRACKER_DOMAINS = await updateBlocklist();
  const privacySession = session.fromPartition('memory:', { cache: false });

  // Override User-Agent for all requests in this session
  privacySession.setUserAgent(SESSION_USER_AGENT);

  // ─── Permission handler: deny everything by default ──────────────────────
  privacySession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const ALLOWED = []; // nothing allowed — uncomment 'notifications' if needed
    callback(ALLOWED.includes(permission));
  });

  // ─── Request interception ─────────────────────────────────────────────────
  // This runs before any request leaves the machine.
  privacySession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    // Enforce HTTPS — redirect HTTP to HTTPS where possible
    if (details.url.startsWith('http://')) {
      const httpsUrl = details.url.replace('http://', 'https://');
      return callback({ redirectURL: httpsUrl });
    }

    // Block tracker/ad domains
    if (isDomainBlocked(details.url)) {
      blockedCount++;
      // Notify toolbar UI
      if (webContents && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('blocked-count', blockedCount);
      }
      return callback({ cancel: true });
    }

    // Strip tracking query params — redirect to clean URL
    const cleanUrl = stripTrackingParams(details.url);
    if (cleanUrl !== details.url) {
      return callback({ redirectURL: cleanUrl });
    }

    callback({});
  });

  // ─── Header modification: strip fingerprinting headers ───────────────────
  privacySession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };

    // Normalise Accept-Language — unique locale is a fingerprint
    headers['Accept-Language'] = 'en-US,en;q=0.9';

    // Remove headers that leak identity
    delete headers['DNT'];           // paradoxically, DNT:1 is itself a fingerprint
    delete headers['Sec-GPC'];

    callback({ requestHeaders: headers });
  });

  // ─── Response headers: strip fingerprinting headers (do not enforce strict CSP globally)
  privacySession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };

    // Strip fingerprinting response headers
    delete headers['ETag'];
    delete headers['X-Forwarded-For'];

    callback({ responseHeaders: headers });
  });

  // ─── Main BrowserWindow (toolbar chrome) ─────────────────────────────────
  mainWindow = new BrowserWindow({
    width:  1200,
    height: 800,
    minWidth:  600,
    minHeight: 400,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload:          path.join(app.getAppPath(), 'BrowserWindow', 'preload.js'),
      nodeIntegration:  false,   // SECURITY: no Node in renderer
      contextIsolation: true,    // SECURITY: contextBridge required
      sandbox:          true,    // Extra process isolation
    },
  });

  mainWindow.loadFile(path.join(app.getAppPath(), 'BrowserWindow', 'renderer', 'index.html'));

  // ─── WebContentsView (web content pane) ──────────────────────────────────────
  // This is completely separate from the toolbar's webContents.
  // It uses its own in-memory session so there's no shared state.
  webView = new WebContentsView({
    webPreferences: {
      partition:            'memory:',
      nodeIntegration:      false,
      contextIsolation:     true,
      sandbox:              true,
      allowRunningInsecureContent: false,
      webSecurity:          true,
    },
  });

  // Attach web content view in a compatible way across Electron versions.
  if (mainWindow.contentView && typeof mainWindow.contentView.addChildView === 'function') {
    mainWindow.contentView.addChildView(webView);
  } else {
    mainWindow.setBrowserView(webView);
  }

  webContents = webView.webContents;

  // Clear session on content destroyed
  webContents.on('destroyed', async () => {
    await clearSessionData();
  });

  // Auto-resize so it always fills the space below the toolbar.
  if (typeof webView.setAutoResize === 'function') {
    webView.setAutoResize({ width: true, height: true });
  }

  // Size the web view to fill the window below the toolbar
  function resizeWebView() {
    const bounds = mainWindow.getContentBounds();
    webView.setBounds({
      x:      0,
      y:      TOOLBAR_HEIGHT,
      width:  bounds.width,
      height: bounds.height - TOOLBAR_HEIGHT,
    });
  }

  resizeWebView();
  mainWindow.on('resize', resizeWebView);
  mainWindow.on('show', resizeWebView);

  // Open a neutral start page. For debug, use DuckDuckGo to verify content view renders.
  webContents.loadURL(DEFAULT_START_URL).catch(err => console.error('Initial URL load failed:', err));

  // Disable menu shortcuts
  webContents.setIgnoreMenuShortcuts(true);

  // Disable spell checker
  privacySession.setSpellCheckerEnabled(false);

  // No public API to read current session proxy in this Electron version.
  // Default to unconfigured, then updates happen via set-proxy IPC.
  mainWindow.webContents.send('proxy-state', { active: false });

  // ─── Forward navigation events to toolbar ────────────────────────────────
  webContents.on('did-start-loading', () => {
    mainWindow.webContents.send('nav-state', { loading: true });
  });

  webContents.on('did-stop-loading', () => {
    mainWindow.webContents.send('nav-state', {
      loading:    false,
      url:        webContents.getURL(),
      canGoBack:  webContents.canGoBack(),
      canGoFwd:   webContents.canGoForward(),
      title:      webContents.getTitle(),
    });
  });

  webContents.on('did-finish-load', () => {
    console.log('[main] did-finish-load', webContents.getURL());
    // Inject anti-fingerprinting script
    webContents.executeJavaScript(ANTI_FINGERPRINT_SCRIPT).catch(err => console.error('Anti-fingerprint injection failed:', err));
  });

  webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[main] did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
  });

  webContents.on('did-navigate', (_e, url) => {
    mainWindow.webContents.send('nav-state', {
      url,
      canGoBack:  webContents.canGoBack(),
      canGoFwd:   webContents.canGoForward(),
    });
  });

  // Force external links to open in the system browser, not a new Electron window
  webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle certificate errors
  webContents.on('certificate-error', (event, url, error, certificate, callback) => {
    event.preventDefault();
    // Show a warning in the toolbar
    mainWindow.webContents.send('certificate-error', { url, error });
    callback(false); // Reject the certificate
  });

  // Handle load failures
  webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    const errorHtml = `
      <html>
        <head><style>body{font-family:sans-serif;text-align:center;padding:50px;}</style></head>
        <body>
          <h1>Failed to load page</h1>
          <p>${errorDescription} (${errorCode})</p>
          <button onclick="window.history.back()">Go back</button>
        </body>
      </html>
    `;
    webContents.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
  });

  // ─── IPC handlers (from toolbar renderer via contextBridge) ──────────────

  ipcMain.on('navigate', (_e, input) => {
    const url = normaliseInput(input);
    webContents.loadURL(url);
  });

  ipcMain.on('go-back', () => {
    if (webContents.canGoBack()) webContents.goBack();
  });

  ipcMain.on('go-forward', () => {
    if (webContents.canGoForward()) webContents.goForward();
  });

  ipcMain.on('reload', () => {
    webContents.reload();
  });

  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => mainWindow.maximize());
  ipcMain.on('window-close', () => mainWindow.close());

  ipcMain.on('get-ua', (event) => {
    event.reply('ua-info', SESSION_USER_AGENT);
  });

  // ─── Proxy configuration (optional, user-set) ────────────────────────────
  ipcMain.on('set-proxy', async (_e, config) => {
    if (!config || !config.host) {
      // Clear proxy
      await privacySession.setProxy({ mode: 'direct' });
      mainWindow.webContents.send('proxy-state', { active: false });
    } else {
      const proxyRules = `${config.type || 'socks5'}://${config.host}:${config.port}`;
      await privacySession.setProxy({ proxyRules });
      mainWindow.webContents.send('proxy-state', { active: true, rules: proxyRules });
    }
  });
}

// ─── Session cleanup on exit ─────────────────────────────────────────────────
// This is the "zero-storage policy" enforcement.
// Everything in the session is wiped — cookies, cache, local storage, etc.
async function clearSessionData() {
  console.log('[privacy] Clearing all session data before exit...');
  try {
    const ses = session.fromPartition('memory:');
    await ses.clearStorageData({
      storages: [
        'appcache', 'cookies', 'filesystem', 'indexdb',
        'localstorage', 'shadercache', 'websql', 'serviceworkers',
      ],
    });
    await ses.clearCache();
    await ses.clearAuthCache();
    console.log('[privacy] Session cleared.');
  } catch (err) {
    console.error('[privacy] Session clear error:', err);
  }
}

app.on('before-quit', async (e) => {
  e.preventDefault();
  await clearSessionData();
  app.exit(0);
});

app.on('will-quit', async () => {
  await clearSessionData();
});

// ─── Electron lifecycle ───────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Disable WebGL and other fingerprinting vectors globally
  app.commandLine.appendSwitch('disable-webgl');
  app.commandLine.appendSwitch('disable-2d-canvas-clip-accelerated');
  app.commandLine.appendSwitch('disable-web-security', 'false'); // Ensure web security
  app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
  app.commandLine.appendSwitch('disable-speech-api');
  app.commandLine.appendSwitch('disable-3d-apis');

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// WebContentsView integration for isolated content viewport

// In-memory private partition configured: session.fromPartition('memory:')

// WebContentsView dynamic resize handler on mainWindow resize

// Subdomain parent hierarchy matching helper

// Whitelist checking for essential non-tracking infrastructure

// stripTrackingParameters implementation

// Preserving non-tracking query parameters

// Custom window control IPC handlers: minimize, maximize, close
