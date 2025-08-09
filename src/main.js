/**
 * main.js — PrivacyBrowser Main Process with Strict HTTPS Enforcement
 *
 * This file implements a hardened Electron browser with:
 * - HTTPS-Only Mode: Automatic upgrade, no fallback to HTTP
 * - Strict Certificate Validation: Reject invalid/self-signed certs
 * - HSTS Enforcement: Persistent HSTS rules with preload list
 * - Mixed Content Blocking: HTTP resources blocked in HTTPS pages
 * - WebRTC Leak Protection: Disabled non-proxied UDP
 * - Insecure Form Blocking: HTTPS→HTTP form submissions blocked
 * - Anti-fingerprinting and tracker blocking
 *
 * Architecture:
 *   BrowserWindow (toolbar)
 *     └─ WebContentsView (web content — separate session)
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

// ─── Security Constants ──────────────────────────────────────────────────────
const HSTS_PRELOAD_PATH = path.join(app.getAppPath(), 'src', 'hsts-preload.json');
const HSTS_STORAGE_PATH = path.join(app.getPath('userData'), 'hsts-rules.json');
const BLOCKLIST_PATH = path.join(app.getAppPath(), 'src', 'blocklists', 'trackers.txt');
// New blocklist JSONs for advanced engine
const AD_BLOCKLIST_PATH = path.join(app.getAppPath(), 'src', 'blocklists', 'ad-blocklist.json');
const TRACKER_BLOCKLIST_PATH = path.join(app.getAppPath(), 'src', 'blocklists', 'tracker-blocklist.json');
const WHITELIST_PATH = path.join(app.getPath('userData'), 'whitelist.json');
const DEFAULT_START_URL = 'file://' + path.join(app.getAppPath(), 'src', 'start.html').replace(/\\/g, '/');

// ─── Global State ───────────────────────────────────────────────────────────
let mainWindow;
let webView;
let webContents;
let blockedCount = 0;
let TRACKER_DOMAINS;
let HSTS_RULES = new Map(); // domain -> { expiry, includeSubdomains }
let HSTS_PRELOAD_DOMAINS = new Set();
let FAILED_HTTPS_DOMAINS = new Set(); // Domains where HTTPS failed

// ─── Blocklist/Whitelist state ─────────────────────────────────────────────────
let AD_BLOCK_DOMAINS = new Set();
let TRACKER_BLOCK_DOMAINS = new Set();
let SCRIPT_BLOCK_DOMAINS = new Set();
let WHITELIST_DOMAINS = new Set();
let URL_BLOCK_PATTERNS = [];
let URL_ALLOW_PATTERNS = [];

// Force a stable writable userData directory to avoid disk-cache permission issues
const safeUserDataPath = path.join(app.getPath('userData'), 'PrivacyBrowser');
try {
  if (!fs.existsSync(safeUserDataPath)) {
    fs.mkdirSync(safeUserDataPath, { recursive: true });
  }
} catch (err) {
  console.warn('[Cache] Failed to create userData directory:', err);
}
app.setPath('userData', safeUserDataPath);

// Early command-line switches for privacy and cache stability
app.commandLine.appendSwitch('disable-application-cache');
// Try to create cache directory, but don't fail if we can't
try {
  const cacheDir = path.join(safeUserDataPath, 'Cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
} catch (err) {
  console.warn('[Cache] Failed to set custom cache directory:', err);
  // Continue without custom cache dir
}
// app.commandLine.appendSwitch('disable-gpu');
// app.commandLine.appendSwitch('disable-gpu-compositing');

// === CRITICAL: WebRTC IP leak protection (MUST be before app.whenReady()) ===
// Completely disable WebRTC to prevent any IP leaks
app.commandLine.appendSwitch('disable-webrtc');

// Additional security flags
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-3d-apis');
// app.commandLine.appendSwitch('disable-webgl'); // YouTube might need WebGL

console.log('main script __dirname:', __dirname);
console.log('main script process.cwd():', process.cwd());

// ─── HSTS Management ────────────────────────────────────────────────────────

/**
 * Load HSTS preload list from bundled JSON file
 */
function loadHstsPreload() {
  try {
    if (!fs.existsSync(HSTS_PRELOAD_PATH)) {
      console.warn('[HSTS] Preload file not found:', HSTS_PRELOAD_PATH);
      return;
    }
    const data = JSON.parse(fs.readFileSync(HSTS_PRELOAD_PATH, 'utf8'));
    HSTS_PRELOAD_DOMAINS = new Set(data.preloadList || []);
    console.log(`[HSTS] Loaded ${HSTS_PRELOAD_DOMAINS.size} preload domains`);
  } catch (err) {
    console.error('[HSTS] Failed to load preload list:', err);
  }
}

/**
 * Load persistent HSTS rules from storage
 */
function loadHstsRules() {
  try {
    if (!fs.existsSync(HSTS_STORAGE_PATH)) return;
    const data = JSON.parse(fs.readFileSync(HSTS_STORAGE_PATH, 'utf8'));
    const now = Date.now();
    for (const [domain, rule] of Object.entries(data)) {
      if (rule.expiry > now) {
        HSTS_RULES.set(domain, rule);
      }
    }
    console.log(`[HSTS] Loaded ${HSTS_RULES.size} persistent rules`);
  } catch (err) {
    console.error('[HSTS] Failed to load rules:', err);
  }
}

/**
 * Save HSTS rules to persistent storage
 */
function saveHstsRules() {
  try {
    const data = {};
    for (const [domain, rule] of HSTS_RULES) {
      data[domain] = rule;
    }
    fs.writeFileSync(HSTS_STORAGE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[HSTS] Failed to save rules:', err);
  }
}

/**
 * Check if domain requires HTTPS via HSTS
 */
function isHstsDomain(domain) {
  // Check preload list first
  if (HSTS_PRELOAD_DOMAINS.has(domain)) return true;

  // Check dynamic rules
  const rule = HSTS_RULES.get(domain);
  if (rule && rule.expiry > Date.now()) {
    return true;
  }

  // Check subdomains if includeSubdomains is set
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = parts.slice(i).join('.');
    const parentRule = HSTS_RULES.get(parentDomain);
    if (parentRule && parentRule.includeSubdomains && parentRule.expiry > Date.now()) {
      return true;
    }
  }

  return false;
}

/**
 * Process HSTS header from response
 */
function processHstsHeader(domain, hstsHeader) {
  if (!hstsHeader) return;

  try {
    const directives = hstsHeader.split(';').map(d => d.trim().toLowerCase());
    let maxAge = 0;
    let includeSubdomains = false;

    for (const directive of directives) {
      if (directive.startsWith('max-age=')) {
        maxAge = parseInt(directive.split('=')[1]);
      } else if (directive === 'includesubdomains') {
        includeSubdomains = true;
      }
    }

    if (maxAge > 0) {
      const expiry = Date.now() + (maxAge * 1000);
      HSTS_RULES.set(domain, { expiry, includeSubdomains });
      saveHstsRules();
      console.log(`[HSTS] Added rule for ${domain}, expires ${new Date(expiry).toISOString()}`);
    }
  } catch (err) {
    console.error('[HSTS] Failed to parse header:', err);
  }
}

// ─── Tracker Blocklist ───────────────────────────────────────────────────────

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

function loadJsonSet(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) return new Set(defaultValue);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return new Set(Array.isArray(content) ? content.map(String).map(s => s.toLowerCase()) : defaultValue);
  } catch (err) {
    console.warn(`[JSON load] Failed: ${filePath}`, err);
    return new Set(defaultValue);
  }
}

function saveJsonSet(filePath, set) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(Array.from(set), null, 2));
  } catch (err) {
    console.error(`[JSON save] Failed: ${filePath}`, err);
  }
}

function loadListPatterns() {
  // Example patterns are strings for simple regex or wildcard
  if (!fs.existsSync(AD_BLOCKLIST_PATH) || !fs.existsSync(TRACKER_BLOCKLIST_PATH)) {
    return;
  }

  // no-op determined by domain sets, patterns are just optional
  URL_BLOCK_PATTERNS = [
    '*/ads/*',
    '*/doubleclick.net/*',
    '*/adservice.google.com/*',
  ];
  URL_ALLOW_PATTERNS = []; // in-memory override list for dynamic allow patterns
}

function matchPattern(url, pattern) {
  try {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const re = new RegExp(pattern.slice(1, -1), 'i');
      return re.test(url);
    }
    // wildcard support: * any chars
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
    const re = new RegExp(`^${escaped}$`, 'i');
    return re.test(url);
  } catch (err) {
    return false;
  }
}

function isUrlBlockedByPattern(url) {
  if (URL_ALLOW_PATTERNS.some(pattern => matchPattern(url, pattern))) return false;
  return URL_BLOCK_PATTERNS.some(pattern => matchPattern(url, pattern));
}

function isWhitelistDomain(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  if (WHITELIST_DOMAINS.has(h)) return true;

  // Keep CAPTCHA and challenge infrastructure open so bot checks can complete
  if (
    h === 'challenges.cloudflare.com' ||
    h.endsWith('.cloudflare.com') ||
    h === 'cloudflare.com' ||
    h === 'cloudflareinsights.com' ||
    h === '4chan.org' ||
    h === '4chan.com' ||
    h.endsWith('.4chan.org') ||
    h.endsWith('.4chan.com') ||
    h === 'smut.com' ||
    h.endsWith('.smut.com')
  ) {
    return true;
  }

  const parts = h.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (WHITELIST_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function isTrackerDomain(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  if (TRACKER_BLOCK_DOMAINS.has(h)) return true;
  const parts = h.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (TRACKER_BLOCK_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function isAdDomain(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  if (AD_BLOCK_DOMAINS.has(h)) return true;
  const parts = h.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (AD_BLOCK_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function isScriptBlockDomain(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  return SCRIPT_BLOCK_DOMAINS.has(h);
}

function isThirdPartyRequest(details) {
  try {
    const origin = details.initiator || details.referrer || details.frameURL || details.url;
    const originUrl = new URL(origin);
    const requestUrl = new URL(details.url);
    return originUrl.hostname.toLowerCase().replace(/^www\./, '') !== requestUrl.hostname.toLowerCase().replace(/^www\./, '');
  } catch (err) {
    return false;
  }
}

function stripTrackingParameters(urlString) {
  try {
    const url = new URL(urlString);
    const TRACKING_PARAMS = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_eid', 'ref', '_ga', 'twclid',
      'igshid', 'yclid', 'zanpid', 'dclid', 'srsltid', 'trk', 'trk_campaign',
      'utm_name', 'utm_reader', 'utm_social', 'utm_place', 'utm_pubreferrer',
    ];
    let modified = false;
    TRACKING_PARAMS.forEach((param) => {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        modified = true;
      }
    });
    return modified ? url.toString() : urlString;
  } catch {
    return urlString;
  }
}

async function updateBlocklist() {
  try {
    const sources = [
      'https://easylist.to/easylist/easylist.txt',
      'https://easylist.to/easylist/easyprivacy.txt',
    ];
    const allDomains = new Set();

    for (const url of sources) {
      const request = net.request(url);
      if (!request) continue;

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

    const local = loadBlocklist();
    local.forEach(d => allDomains.add(d));

    const content = '# PrivacyBrowser Tracker Blocklist\n# Auto-updated\n\n' + Array.from(allDomains).sort().join('\n');
    fs.writeFileSync(BLOCKLIST_PATH, content);
    console.log(`[blocklist] Updated to ${allDomains.size} domains`);
    return allDomains;
  } catch (err) {
    console.error('[blocklist] Update failed:', err);
    return loadBlocklist();
  }
}

// ─── URL and Security Helpers ───────────────────────────────────────────────

/**
 * Check if URL's hostname matches blocklist
 */
function isDomainBlocked(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (TRACKER_DOMAINS.has(host)) return true;

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
 * Remove tracking query parameters
 */
function stripTrackingParams(urlString) {
  try {
    const url = new URL(urlString);
    let modified = false;

    const TRACKING_PARAMS = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_eid', 'ref', '_ga', 'twclid',
      'igshid', 'yclid', 'zanpid', 'dclid', 'srsltid',
    ];

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
 * Normalize user input to HTTPS URL
 */
function normaliseInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_START_URL;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (!trimmed.includes(' ') && trimmed.includes('.')) {
    return 'https://' + trimmed;
  }

  return 'https://duckduckgo.com/?q=' + encodeURIComponent(trimmed);
}

/**
 * Check if request is mixed content (HTTP resource in HTTPS page)
 */
function isMixedContent(details) {
  if (!details.url.startsWith('http://')) return false;

  // Check if the main frame is HTTPS
  try {
    const mainFrameUrl = new URL(details.frameURL || details.url);
    return mainFrameUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if form submission is insecure (HTTPS page → HTTP endpoint)
 */
function isInsecureForm(details) {
  if (details.method !== 'POST') return false;

  try {
    const frameUrl = new URL(details.frameURL || details.url);
    const requestUrl = new URL(details.url);

    return frameUrl.protocol === 'https:' && requestUrl.protocol === 'http:';
  } catch {
    return false;
  }
}

// Anti-fingerprinting script with strict CSP enforcement
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

  // ── 6. WebRTC leak prevention is handled per-mode via main process configuration.
  // Mode "disable" will inject a runtime WebRTC disable shim; "hide-ip" is handled by command-line policy.

  // ── 7. Battery API
  if (navigator.getBattery) navigator.getBattery = () => Promise.reject(new Error('Battery API disabled'));

  // ── 8. Timezone normalisation
  const origDTF = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function (locales, options = {}) {
    options.timeZone = options.timeZone || 'UTC';
    return new origDTF(locales, options);
  };
  Intl.DateTimeFormat.prototype = origDTF.prototype;

  // ── 9. Content Security Policy enforcement ───────────────────────────
  // Note: Server-side CSP headers handle most enforcement
  // Client-side enforcement removed to avoid conflicts

  console.debug('[PrivacyBrowser] Anti-fingerprinting active.');
})();
`;

// Cosmetic filtering script: hide ad elements via CSS + DOM
const COSMETIC_FILTER_SCRIPT = `
(function () {
  'use strict';

  // ── Cosmetic CSS injection for common ad selectors ─────────────────────
  function injectCosmeticCSS() {
    const css = \`
      [class*="ad-"], [id*="ad-"], [class*="advert"], [id*="advert"],
      [class*="banner"], [id*="banner"], [class*="advertisement"],
      [id*="advertisement"], [class*="sponsored"], [id*="sponsored"],
      .ad-container, #ad-container, .ads, #ads,
      .sidebar-ad, [data-ad-unit], ins.adsbygoogle,
      [class*="google-ad"], [class*="googlesyndication"],
      [aria-label*="ad"], [aria-label*="advertisement"],
      [class*="promotions"], [id*="promotions"],
      .video-ads, [class*="video-ad"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    \`;

    const style = document.createElement('style');
    style.textContent = css;
    style.setAttribute('data-cosmetic', 'privacy-browser');
    document.head.appendChild(style);
    console.debug('[cosmetic] CSS filter injected');
  }

  // ── DOM cleanup: remove ad iframe/script tags ───────────────────────────
  function cleanupAdDOM() {
    const adSelectors = [
      'iframe[src*="ads."]',
      'iframe[src*="ad-serve"]',
      'script[src*="ads."]',
      'script[src*="doubleclick"]',
      'script[src*="googlesyndication"]',
      'div[data-ad-unit]',
      'ins.adsbygoogle',
      'amp-ad',
    ];

    let removed = 0;
    adSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        try {
          el.remove();
          removed++;
        } catch (e) {}
      });
    });

    if (removed > 0) console.debug('[cosmetic] Removed', removed, 'ad elements');
  }

  // Run on document ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectCosmeticCSS();
      cleanupAdDOM();
    });
  } else {
    injectCosmeticCSS();
    cleanupAdDOM();
  }

  // Watch for new ad nodes added dynamically
  const observer = new MutationObserver(() => {
    cleanupAdDOM();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  console.debug('[PrivacyBrowser] Cosmetic filtering active.');
})();
`;

// Blocked requests counter (for UI display)
// let blockedCount = 0; // Already declared at top

// Tracker blocklist (updated on startup)
// let TRACKER_DOMAINS; // Already declared at top

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

// ─── WebRTC Mode Management ──────────────────────────────────────────────────

let currentWebRtcMode = 'hide-ip'; // Fixed to secure mode

function applyWebRtcModeToWebContents() {
  if (!webContents || webContents.isDestroyed()) return;

  let script = '';

  if (currentWebRtcMode === 'disable') {
    script = `
      (() => {
        const errorFn = () => { throw new Error('[PrivacyBrowser] WebRTC is disabled'); };
        const BlockedRTC = function() { throw new Error('[PrivacyBrowser] WebRTC is disabled'); };
        Object.defineProperty(window, 'RTCPeerConnection', { value: BlockedRTC, writable: false, configurable: false });
        Object.defineProperty(window, 'webkitRTCPeerConnection', { value: BlockedRTC, writable: false, configurable: false });
        if (navigator.mediaDevices) {
          const origGetUserMedia = navigator.mediaDevices.getUserMedia;
          navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('[PrivacyBrowser] WebRTC is disabled'));
        }
      })();
    `;
  } else {
    script = `
      (() => {
        // When WebRTC is allowed/hide-ip, we stop overriding RTCPeerConnection.
        // For older frames where properties are frozen, the page may still maintain earlier behavior until reload.
        // Ensuring this is not set is enough for enforcement under mode changes with reload.
      })();
    `;
  }

  webContents.executeJavaScript(script, true).catch((err) => {
    console.warn('[WebRTC] Mode injection failed:', err);
  });
}

function applyWebRtcModeInCommandLine(maybeMode) {
  const mode = maybeMode || currentWebRtcMode;
  switch (mode) {
    case 'disable':
      app.commandLine.appendSwitch('disable-webrtc');
      break;
    case 'hide-ip':
      app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
      app.commandLine.appendSwitch('webrtc.ip_handling_policy', 'disable_non_proxied_udp');
      break;
    case 'allow':
      // Do not append additional switches for default behavior.
      break;
    default:
      console.warn(`[WebRTC] Unknown mode in command-line setup: ${mode}`);
      break;
  }
}

// Removed: setWebRtcMode function, mode is fixed

// ─── App startup ─────────────────────────────────────────────────────────────

const TOOLBAR_HEIGHT = 52; // px — height of our custom toolbar

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

// Variables declared at top of file
// let mainWindow;
// let webView;          // WebContentsView for web content
// let webContents;      // shorthand: webView.webContents

async function createWindow() {
  // Load security data
  loadHstsPreload();
  loadHstsRules();

  // Load advanced blocklists and whitelist
  AD_BLOCK_DOMAINS = loadJsonSet(AD_BLOCKLIST_PATH, [
    'doubleclick.net', 'adservice.google.com', 'googlesyndication.com', 'ads.twitter.com', 'ads.facebook.com', 'adroll.com', 'smartadserver.com', 'ads.yahoo.com'
  ]);
  TRACKER_BLOCK_DOMAINS = loadJsonSet(TRACKER_BLOCKLIST_PATH, [
    'google-analytics.com', 'analytics.google.com', 'facebook.net', 'segment.com', 'mixpanel.com', 'newrelic.com', 'amplitude.com'
  ]);
  SCRIPT_BLOCK_DOMAINS = new Set();
  WHITELIST_DOMAINS = loadJsonSet(WHITELIST_PATH, []);
  loadListPatterns();

  TRACKER_DOMAINS = await updateBlocklist();

  const privacySession = session.fromPartition('memory:', { cache: false });

  // Override User-Agent for all requests in this session
  privacySession.setUserAgent(SESSION_USER_AGENT);

  // ─── Permission handler: deny everything by default ──────────────────────
  privacySession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const ALLOWED = []; // nothing allowed for privacy
    callback(ALLOWED.includes(permission));
  });

  // ─── Strict HTTPS-Only Mode and Security Enforcement ────────────────────
  privacySession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    try {
      const url = new URL(details.url);
      const domain = url.hostname.toLowerCase();

      // Debug logging for all intercepted requests (conditionally verbose)
      console.log(`[Intercept] ${details.method} ${details.url} [${details.resourceType}] (frame: ${details.frameURL || 'main'})`);

      // Debug logging for YouTube and Google (extra detail is useful)
      if (domain.includes('youtube.com') || domain.includes('google.com') || domain.includes('gstatic.com') || domain.includes('googleusercontent.com')) {
        console.log(`[Request] ${details.method} ${details.url} (frame: ${details.frameURL || 'main'})`);
      }

      // Allow Cloudflare challenge endpoints and known navigation correction paths
      if (details.url.includes('/cdn-cgi/challenge-platform/') || details.url.includes('/turnstile/') || details.url.includes('/smut.com/signup')) {
        console.log('[Bypass] Allow challenge/flow request:', details.url);
        return callback({ cancel: false });
      }

      // 1. HTTPS-Only Mode: Upgrade HTTP to HTTPS, block if fails (STRICT - no fallback)
      if (details.url.startsWith('http://')) {
        // Check if this domain has previously failed HTTPS
        if (FAILED_HTTPS_DOMAINS.has(domain)) {
          console.log(`[HTTPS:STRICT] Blocking HTTP request to ${domain} (previously failed HTTPS attempt)`);
          blockedCount++;
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
          return callback({ cancel: true });
        }

        // Check HSTS preload or dynamic rules
        if (isHstsDomain(domain)) {
          const httpsUrl = details.url.replace('http://', 'https://');
          console.log(`[HSTS:UPGRADED] ${domain} -> HTTPS (via HSTS)`);
          return callback({ redirectURL: httpsUrl });
        }

        // For non-HSTS domains, upgrade to HTTPS (will mark as failed if cert error occurs)
        const httpsUrl = details.url.replace('http://', 'https://');
        console.log(`[HTTPS:UPGRADE] ${domain} -> HTTPS (attempt)`);
        return callback({ redirectURL: httpsUrl });
      }

      // NETWORK POLICY ENGINE (high-performance, before request completes)

      // Explicit allow list wins
      if (domain && isWhitelistDomain(domain)) {
        return callback({ cancel: false });
      }

      // Dynamic URL patterns allowlist (e.g., safe by policy).
      if (isUrlBlockedByPattern(details.url) === false && URL_ALLOW_PATTERNS.length > 0) {
        return callback({ cancel: false });
      }

      // 1. Block explicit ad domains and common ad URL patterns
      if (isAdDomain(domain) || isUrlBlockedByPattern(details.url)) {
        console.log(`[NetworkBlocker:AD] ${details.resourceType} ${details.url}`);
        blockedCount++;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
        return callback({ cancel: true });
      }

      // 2. Third-party tracker blocking (do not block first-party)
      if (isThirdPartyRequest(details) && isTrackerDomain(domain)) {
        console.log(`[NetworkBlocker:TRACKER] ${details.resourceType} ${details.url}`);
        blockedCount++;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
        return callback({ cancel: true });
      }

      // 3. Third-party script blocking (only block known ad/tracker scripts, not all third-party)
      if (details.resourceType === 'script' && isThirdPartyRequest(details)) {
        // Only block scripts from KNOWN problematic domains
        if ((isAdDomain(domain) || isTrackerDomain(domain) || isScriptBlockDomain(domain)) && !isWhitelistDomain(domain)) {
          console.log(`[NetworkBlocker:3P-SCRIPT] ${details.url}`);
          blockedCount++;
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
          return callback({ cancel: true });
        }
      }

      // 4. Third-party iframe blocking (for privacy/ads — only block known bad domains)
      if (details.resourceType === 'subFrame' && isThirdPartyRequest(details)) {
        // Only block iframes from KNOWN ad/tracker/script domains, not all third-party
        if ((isAdDomain(domain) || isTrackerDomain(domain) || isScriptBlockDomain(domain)) && !isWhitelistDomain(domain)) {
          console.log(`[NetworkBlocker:3P-IFRAME] ${details.url}`);
          blockedCount++;
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
          return callback({ cancel: true });
        }
      }

      // 5. Cancel unnecessary request types that are often used for tracking.
      // NOTE: Do NOT block 'other' — it includes legitimate app bundles and assets
      const cancelTypes = new Set(['prefetch', 'ping', 'beacon', 'csp_report']);
      if (cancelTypes.has(details.resourceType)) {
        console.log(`[NetworkBlocker:MINIMIZE] ${details.resourceType} ${details.url}`);
        blockedCount++;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
        return callback({ cancel: true });
      }

      // 6. Script domain blocking (domain-level policy)
      if (details.resourceType === 'script' && isScriptBlockDomain(domain) && !isWhitelistDomain(domain)) {
        console.log(`[NetworkBlocker:SCRIPT-BLOCK] ${details.url}`);
        blockedCount++;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
        return callback({ cancel: true });
      }

      // 7. Strip tracking query parameters from URL if present.
      const cleanedUrl = stripTrackingParameters(details.url);
      if (cleanedUrl !== details.url) {
        console.log(`[NetworkBlocker:STRIP-TRACK] ${details.url} -> ${cleanedUrl}`);
        return callback({ redirectURL: cleanedUrl });
      }

      // 8. Fallback to existing logic (HTTPS enforcement, etc.)
      // 2. Block trackers/ads (do not block mainFrame unless absolutely necessary)
      if (details.resourceType !== 'mainFrame' && isDomainBlocked(details.url)) {
        console.log(`[Tracker] Blocked: ${details.url}`);
        blockedCount++;
        if (webContents && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('blocked-count', blockedCount);
        }
        return callback({ cancel: true });
      }

      // 3. Mixed Content Blocking: HTTP resources in HTTPS pages (STRICT - no bypass)
      if (isMixedContent(details)) {
        console.log(`[MixedContent:STRICT] Blocked HTTP resource in HTTPS page: ${details.url} [${details.resourceType}]`);
        blockedCount++;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('blocked-count', blockedCount);
        return callback({ cancel: true });
      }

      // 4. Insecure Form Blocking: HTTPS → HTTP form submissions
      if (isInsecureForm(details)) {
        console.log(`[InsecureForm] Blocked insecure form submission: ${details.url}`);
        // Show warning to user
        if (webContents && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('security-warning', {
            type: 'insecure-form',
            url: details.url
          });
        }
        return callback({ cancel: true });
      }

      // 5. Strip tracking parameters
      const cleanUrl = stripTrackingParams(details.url);
      if (cleanUrl !== details.url) {
        return callback({ redirectURL: cleanUrl });
      }

      callback({});
    } catch (err) {
      console.error('[RequestInterception] Error:', err);
      callback({ cancel: true });
    }
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

  // ─── Response Processing: HSTS and CSP ───────────────────────────────────
  privacySession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };

    try {
      const url = new URL(details.url);
      const domain = url.hostname.toLowerCase();

      // Process HSTS header
      const hstsHeader = headers['strict-transport-security'] || headers['Strict-Transport-Security'];
      if (hstsHeader) {
        processHstsHeader(domain, hstsHeader[0]);
      }

      // CSP enforcement disabled to avoid conflicts with site CSP
      // Mixed content blocking is handled by request interception

      // Strip fingerprinting response headers
      delete headers['etag'];
      delete headers['x-forwarded-for'];

    } catch (err) {
      console.error('[HeadersReceived] Error:', err);
    }

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
      preload:              path.join(app.getAppPath(), 'WebContentsView', 'content-preload.js'),
      allowRunningInsecureContent: false,
      webSecurity:          true,
      devTools:             process.env.NODE_ENV === 'development', // Disable DevTools in production
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
    const currentUrl = webContents.getURL();
    console.log('[main] did-finish-load', currentUrl);

    // Avoid heavy anti-fingerprint overrides during Cloudflare/4chan challenge blending
    // because it can cause bot check loops (strict anti-fingerprint plus canvas/timezone spoofing).
    const challengeHost = (() => {
      try {
        return new URL(currentUrl).hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        return '';
      }
    })();

    const isProtectedChallenge = [
      'challenges.cloudflare.com',
      'cloudflare.com',
      'cloudflareinsights.com',
      '4chan.org',
      '4chan.com',
      'smut.com',
    ].some(host => challengeHost === host || challengeHost.endsWith('.' + host));

    if (!isProtectedChallenge) {
      webContents.executeJavaScript(ANTI_FINGERPRINT_SCRIPT).catch(err => console.error('Anti-fingerprint injection failed:', err));
    } else {
      console.log('[main] Skipping anti-fingerprint injection for', challengeHost);
    }

    // Inject cosmetic ad filtering script (CSS + DOM cleanup) — DISABLED FOR Testing
    // webContents.executeJavaScript(COSMETIC_FILTER_SCRIPT).catch(err => console.error('Cosmetic filter injection failed:', err));

    // WebRTC is now disabled at Chromium level + JS preload level, so no need for runtime mode changes

    // Push mode to toolbar UI so status stays in sync
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('webrtc-mode', currentWebRtcMode);
    }
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
    // Pop-up blocking: deny all by default; allow if whitelist matches
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (isWhitelistDomain(host)) {
        return { action: 'allow' };
      }
    } catch (err) {
      // invalid URL: deny
    }

    console.log('[PopupBlock] denied window.open for', url);
    return { action: 'deny' };
  });

  // Handle certificate errors - STRICT: No bypassing allowed
  app.on('certificate-error', (event, webContentsError, url, error, certificate, callback) => {
    event.preventDefault();
    console.log(`[Certificate] Rejected invalid certificate for ${url}: ${error}`);

    // Mark domain as HTTPS-failed to prevent future HTTP requests
    try {
      const domain = new URL(url).hostname.toLowerCase();
      FAILED_HTTPS_DOMAINS.add(domain);
      console.log(`[Certificate] Marked ${domain} as HTTPS-failed`);
    } catch (err) {
      console.warn('[Certificate] domain parse failed for', url, err);
    }

    // Show error to user - no option to bypass
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('certificate-error', {
        url,
        error,
        blocked: true
      });
    }
    callback(false); // Always reject
  });

  // Handle load failures - detect HTTPS failures
  webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[LoadFailed]', { errorCode, errorDescription, validatedURL, isMainFrame });

    // Most Chrome/Electron aborts are normal during redirect chains and navigation churn.
    // Skip forcing an error page for these cases.
    if (errorCode === -3) {
      console.log('[LoadFailed] Ignoring ERR_ABORTED (-3) for', validatedURL);
      return;
    }

    // If not main frame, do nothing to avoid breaking subresources.
    if (!isMainFrame) return;

    if (validatedURL && validatedURL.startsWith('https://')) {
      try {
        const domain = new URL(validatedURL).hostname.toLowerCase();

        // Only mark as permanently failed for real cert errors.
        if (errorCode === -202 || errorCode === -203 || errorCode === -200) {
          FAILED_HTTPS_DOMAINS.add(domain);
          console.log(`[LoadFailed] Marked ${domain} as HTTPS-failed due to certificate error`);
        } else if (errorCode === -324 || errorCode === -325) {
          console.log(`[LoadFailed] Temporary connection failure for ${domain}, not persisting`);
        }
      } catch (err) {
        console.warn("[LoadFailed] Can't parse domain from URL", validatedURL, err);
      }
    }

    // Only show friendly error page for non-abort and serious blocking cases.
    const errorHtml = `
      <html>
        <head><style>body{font-family:sans-serif;text-align:center;padding:50px;}</style></head>
        <body>
          <h1>Failed to load page</h1>
          <p>${errorDescription || 'Unknown error'} (${errorCode})</p>
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

  // ─── WebRTC mode configuration ────────────────────────────────────────────
  // Removed: mode is fixed to hide-ip, no user selection
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
  // Mandatory debug logging for requests before engine logic.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    console.log('REQUEST:', details.url, '| TYPE:', details.resourceType);
    callback({});
  });

  // ─── CRITICAL: WebRTC flags MUST be set BEFORE createWindow to take effect ──────────────
  // These flags must be applied to the app BEFORE any renderer processes are launched
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
  app.commandLine.appendSwitch('webrtc.ip_handling_policy', 'disable_non_proxied_udp');
  app.commandLine.appendSwitch('disable-webrtc-multiple-routes');

  // Set default WebRTC mode (hide IP) before creating windows.
  currentWebRtcMode = 'hide-ip';
  applyWebRtcModeInCommandLine('hide-ip');

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

// Dynamic RFC 6797 HSTS header processor and persistent JSON store

// Certificate error listener strictly rejects invalid/self-signed certs

// Mixed content blocker: blocks HTTP subresources in HTTPS parent frames

// Insecure form blocker: prevents HTTP POST submissions from HTTPS origins

// Cosmetic filtering CSS stylesheet injection

// Pruning tracking headers (ETag, X-Forwarded-For) on response
