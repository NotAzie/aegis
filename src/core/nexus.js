/**
 * NexusCore — The Unified Hyper-Orchestration Engine for PrivacyBrowser V2
 *
 * Consolidates all subsystems (AegisHyperTrie, EntropyShield, GhostEngine,
 * StrictTransport, and MemoryPartition) into a single, cohesive, zero-debt architecture.
 */

const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const { AegisHyperTrie } = require('../engine/hyper-trie');
const { EntropyShield } = require('../engine/entropy-shield');
const { GhostEngine } = require('../engine/ghost-engine');

const TOOLBAR_HEIGHT = 52;
const DEFAULT_START_URL = 'file://' + path.join(app.getAppPath(), 'src', 'start.html').replace(/\\/g, '/');

class Nexus {
  constructor() {
    this.hyperTrie = new AegisHyperTrie();
    this.entropyShield = new EntropyShield();
    this.ghostEngine = new GhostEngine();

    this.mainWindow = null;
    this.webView = null;
    this.webContents = null;
    this.privacySession = null;

    this.blockedCount = 0;
    this.entropyThreatsBlocked = 0;
  }

  async boot() {
    this._configureSwitches();
    this._loadBlocklists();
    this._initSession();
    this._createWindows();
    this._bindIpc();
    console.log('[Nexus] V2 Engine ignited successfully.');
  }

  _configureSwitches() {
    app.commandLine.appendSwitch('disable-application-cache');
    app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
    app.commandLine.appendSwitch('webrtc.ip_handling_policy', 'disable_non_proxied_udp');
    app.commandLine.appendSwitch('disable-webrtc-multiple-routes');
    app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
    app.commandLine.appendSwitch('disable-speech-api');
    app.commandLine.appendSwitch('disable-3d-apis');
  }

  _loadBlocklists() {
    try {
      const adPath = path.join(app.getAppPath(), 'src', 'blocklists', 'ad-blocklist.json');
      const trkPath = path.join(app.getAppPath(), 'src', 'blocklists', 'tracker-blocklist.json');
      const txtPath = path.join(app.getAppPath(), 'src', 'blocklists', 'trackers.txt');

      if (fs.existsSync(adPath)) this.hyperTrie.bulkLoad(JSON.parse(fs.readFileSync(adPath, 'utf8')), 'ad');
      if (fs.existsSync(trkPath)) this.hyperTrie.bulkLoad(JSON.parse(fs.readFileSync(trkPath, 'utf8')), 'tracker');
      if (fs.existsSync(txtPath)) {
        const lines = fs.readFileSync(txtPath, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i].trim();
          if (l && !l.startsWith('#')) this.hyperTrie.insert(l, 'tracker');
        }
      }
      console.log(`[Nexus] Loaded ${this.hyperTrie.ruleCount.toLocaleString()} rules into AegisHyperTrie.`);
    } catch (e) {
      console.warn('[Nexus] Blocklist load notice:', e.message);
    }
  }

  _initSession() {
    this.privacySession = session.fromPartition('memory:', { cache: false });
    this.privacySession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    // Request interception pipeline
    this.privacySession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      try {
        const urlStr = details.url;

        // Skip internal or data URLs
        if (urlStr.startsWith('file://') || urlStr.startsWith('data:') || urlStr.startsWith('chrome:')) {
          return callback({ cancel: false });
        }

        const url = new URL(urlStr);
        const domain = url.hostname.toLowerCase();

        // 1. Strict HTTPS-Only Upgrade
        if (urlStr.startsWith('http://')) {
          return callback({ redirectURL: urlStr.replace('http://', 'https://') });
        }

        // 2. EntropyShield Inspection (Zero-day & CNAME heuristic)
        const entropyCheck = this.entropyShield.inspect(urlStr);
        if (entropyCheck.suspicious) {
          this.blockedCount++;
          this.entropyThreatsBlocked++;
          this._broadcastTelemetry(entropyCheck.reason);
          return callback({ cancel: true });
        }

        // 3. AegisHyperTrie O(1) Rule Matching
        if (this.hyperTrie.matches(domain)) {
          this.blockedCount++;
          this._broadcastTelemetry(`Blocked tracker/ad domain: ${domain}`);
          return callback({ cancel: true });
        }

        // 4. Strip Tracking Query Parameters
        const cleaned = this._stripTrackingParams(url);
        if (cleaned !== urlStr) {
          return callback({ redirectURL: cleaned });
        }

        callback({ cancel: false });
      } catch (err) {
        callback({ cancel: false });
      }
    });

    // Strip response fingerprint headers
    this.privacySession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers['etag'];
      delete headers['x-forwarded-for'];
      callback({ responseHeaders: headers });
    });
  }

  _stripTrackingParams(url) {
    const BAD_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid', 'twclid', 'igshid'];
    let modified = false;
    for (let i = 0; i < BAD_PARAMS.length; i++) {
      if (url.searchParams.has(BAD_PARAMS[i])) {
        url.searchParams.delete(BAD_PARAMS[i]);
        modified = true;
      }
    }
    return modified ? url.toString() : url.toString();
  }

  _broadcastTelemetry(reason) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('nexus-telemetry', {
        blockedCount: this.blockedCount,
        entropyThreats: this.entropyThreatsBlocked,
        recentBlockedReason: reason
      });
    }
  }

  _createWindows() {
    this.mainWindow = new BrowserWindow({
      width: 1240,
      height: 820,
      minWidth: 640,
      minHeight: 480,
      backgroundColor: '#0c0c0e',
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 16 },
      webPreferences: {
        preload: path.join(app.getAppPath(), 'BrowserWindow', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    this.mainWindow.loadFile(path.join(app.getAppPath(), 'BrowserWindow', 'renderer', 'index.html'));

    this.webView = new WebContentsView({
      webPreferences: {
        partition: 'memory:',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(app.getAppPath(), 'WebContentsView', 'content-preload.js'),
        webSecurity: true,
      },
    });

    if (this.mainWindow.contentView && typeof this.mainWindow.contentView.addChildView === 'function') {
      this.mainWindow.contentView.addChildView(this.webView);
    } else {
      this.mainWindow.setBrowserView(this.webView);
    }

    this.webContents = this.webView.webContents;

    const resizeView = () => {
      const bounds = this.mainWindow.getContentBounds();
      this.webView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: bounds.width, height: bounds.height - TOOLBAR_HEIGHT });
    };

    resizeView();
    this.mainWindow.on('resize', resizeView);
    this.webContents.loadURL(DEFAULT_START_URL);

    // Navigation events
    this.webContents.on('did-finish-load', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('nav-state', {
          url: this.webContents.getURL(),
          canGoBack: this.webContents.canGoBack(),
          canGoFwd: this.webContents.canGoForward(),
          title: this.webContents.getTitle(),
        });
      }
    });

    // Handle Certificate Errors
    app.on('certificate-error', (event, _wc, url, _err, _cert, cb) => {
      event.preventDefault();
      cb(false); // Reject always
    });
  }

  _bindIpc() {
    ipcMain.on('navigate', (_e, input) => {
      const trimmed = input.trim();
      if (!trimmed) return this.webContents.loadURL(DEFAULT_START_URL);
      if (/^https?:\/\//i.test(trimmed)) return this.webContents.loadURL(trimmed);
      if (!trimmed.includes(' ') && trimmed.includes('.')) return this.webContents.loadURL('https://' + trimmed);
      this.webContents.loadURL('https://duckduckgo.com/?q=' + encodeURIComponent(trimmed));
    });

    ipcMain.on('go-back', () => this.webContents.canGoBack() && this.webContents.goBack());
    ipcMain.on('go-forward', () => this.webContents.canGoForward() && this.webContents.goForward());
    ipcMain.on('reload', () => this.webContents.reload());
    ipcMain.on('window-minimize', () => this.mainWindow.minimize());
    ipcMain.on('window-maximize', () => this.mainWindow.isMaximized() ? this.mainWindow.unmaximize() : this.mainWindow.maximize());
    ipcMain.on('window-close', () => this.mainWindow.close());
  }

  async shutdown() {
    if (this.privacySession) {
      await this.privacySession.clearStorageData();
      await this.privacySession.clearCache();
    }
    console.log('[Nexus] Clean zero-leak shutdown complete.');
  }
}

module.exports = { Nexus };
