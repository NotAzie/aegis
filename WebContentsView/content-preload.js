/**
 * content-preload.js — Anti-Fingerprinting Content Injection
 *
 * This script is injected into EVERY web page loaded in the WebContentsView.
 * It overrides browser APIs that are commonly used for fingerprinting.
 *
 * Runs BEFORE any page JavaScript — so websites cannot detect the spoofing.
 *
 * Techniques used:
 *   1. Canvas API: getImageData / toDataURL / toBlob return noisy/blank data
 *   2. AudioContext: timing randomisation to defeat audio fingerprinting
 *   3. Screen: fixed dummy resolution exposed
 *   4. Navigator: platform, hardware concurrency, device memory normalised
 *   5. Font enumeration: restricted via document.fonts override
 */

(function () {
  'use strict';

  // Skip heavy anti-fingerprinting in challenge flows (otherwise cloudflare can reject and loop)
  try {
    const host = (window.location.hostname || '').toLowerCase();
    if (window.location.protocol === 'about:' || host === 'challenges.cloudflare.com' || host.endsWith('.cloudflare.com') || host === 'cloudflare.com' || host === 'cloudflareinsights.com' || host === '4chan.org' || host === '4chan.com' || host === 'smut.com') {
      console.debug('[content-preload] challenge/special host: skipping anti-fingerprint scripts for', window.location.href);
      return;
    }
  } catch (e) {
    // If URL parsing fails, continue with current protections
  }

  // ── 0. WebRTC Leak Prevention ──────────────────────────────────────────
  // Completely disable WebRTC to prevent any local IP leaks
  try {
    const BlockedRTC = function() {
      throw new Error('[PrivacyBrowser] WebRTC is disabled for privacy protection');
    };
    
    // Override RTCPeerConnection
    Object.defineProperty(window, 'RTCPeerConnection', {
      value: BlockedRTC,
      writable: false,
      configurable: false
    });
    
    // Override webkit version
    Object.defineProperty(window, 'webkitRTCPeerConnection', {
      value: BlockedRTC,
      writable: false,
      configurable: false
    });
    
    // Override RTCSessionDescription
    if (window.RTCSessionDescription) {
      Object.defineProperty(window, 'RTCSessionDescription', {
        value: BlockedRTC,
        writable: false,
        configurable: false
      });
    }
    
    // Disable getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia;
      navigator.mediaDevices.getUserMedia = function() {
        return Promise.reject(new Error('[PrivacyBrowser] Media access is disabled'));
      };
    }
    
    console.log('[WebRTC] Disabled RTCPeerConnection and getUserMedia');
  } catch (err) {
    console.warn('[WebRTC] Failed to disable:', err.message);
  }

  // ── 1. Canvas fingerprint protection ────────────────────────────────────
  // Return slightly noisy pixel data so each read looks different.
  const origToDataURL   = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob      = HTMLCanvasElement.prototype.toBlob;
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  function addNoise(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Tiny random per-channel noise — imperceptible visually, defeats fingerprint
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
    // Apply noise before export
    const ctx = this.getContext('2d');
    if (ctx) {
      try {
        const id = origGetImageData.call(ctx, 0, 0, this.width, this.height);
        addNoise(id);
        ctx.putImageData(id, 0, 0);
      } catch { /* cross-origin canvas — leave as-is */ }
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
      } catch { /* cross-origin */ }
    }
    return origToBlob.call(this, callback, ...args);
  };

  // ── 2. AudioContext fingerprint protection ──────────────────────────────
  // Audio fingerprinting works by measuring tiny timing differences.
  // Adding random noise to getChannelData breaks this.
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
  // These properties reveal hardware details.
  const navOverrides = {
    hardwareConcurrency: 4,        // Always report 4 cores
    deviceMemory:        8,        // Always report 8GB
    platform:            'Win32',  // Consistent platform string
    maxTouchPoints:      0,
  };

  for (const [key, value] of Object.entries(navOverrides)) {
    try {
      Object.defineProperty(navigator, key, {
        get: () => value,
        configurable: true,
      });
    } catch { /* read-only in some contexts — silently skip */ }
  }

  // ── 4. Screen size normalisation ─────────────────────────────────────────
  // Unusual screen resolutions are a strong fingerprint signal.
  const SCREEN_OVERRIDES = {
    width:       1920,
    height:      1080,
    availWidth:  1920,
    availHeight: 1040,
    colorDepth:  24,
    pixelDepth:  24,
  };

  for (const [key, value] of Object.entries(SCREEN_OVERRIDES)) {
    try {
      Object.defineProperty(screen, key, { get: () => value, configurable: true });
    } catch { /* skip */ }
  }

  // ── 5. Font enumeration restriction ──────────────────────────────────────
  // document.fonts.check() can probe which fonts are installed.
  // We override it to return a consistent fixed set.
  const ALLOWED_FONTS = new Set([
    'Arial', 'Courier New', 'Georgia', 'Times New Roman',
    'Trebuchet MS', 'Verdana', 'sans-serif', 'serif', 'monospace',
  ]);

  if (document.fonts && document.fonts.check) {
    const origCheck = document.fonts.check.bind(document.fonts);
    document.fonts.check = function (font, text) {
      // Extract font family name from CSS font string
      const match = font.match(/"([^"]+)"|'([^']+)'|(\S+)$/);
      const family = match ? (match[1] || match[2] || match[3]) : '';
      return ALLOWED_FONTS.has(family) ? origCheck(font, text) : false;
    };
  }

  // ── 6. WebRTC leak prevention ─────────────────────────────────────────────
  // WebRTC policy is fixed to hide-ip mode.
  function applyWebRtcMode(mode) {
    const setDisabled = () => {
      const BlockedRTC = function () {
        throw new Error('[PrivacyBrowser] RTCPeerConnection is disabled for privacy.');
      };
      Object.defineProperty(window, 'RTCPeerConnection', {
        value: BlockedRTC,
        writable: false,
        configurable: false,
      });
      Object.defineProperty(window, 'webkitRTCPeerConnection', {
        value: BlockedRTC,
        writable: false,
        configurable: false,
      });
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('[PrivacyBrowser] WebRTC is disabled'));
      }
    };

    const setAllow = () => {
      // Do not override; rely on Chromium default for allow mode.
      // Keep existing objects as-is; only disable mode will enforce restriction.
    };

    if (mode === 'disable') {
      setDisabled();
    } else if (mode === 'hide-ip') {
      setAllow();
      // Keep local IP hidden using Chromium flags from main process.
    } else {
      setAllow();
    }

    console.debug('[content-preload] WebRTC mode applied:', mode);
  }

  // Fixed to hide-ip mode
  applyWebRtcMode('hide-ip');

  // Removed: IPC listener for mode changes, mode is fixed

  // ── 7. Battery API (another fingerprint source) ───────────────────────────
  if (navigator.getBattery) {
    navigator.getBattery = () => Promise.reject(new Error('Battery API disabled'));
  }

  // ── 8. Timezone normalisation ─────────────────────────────────────────────
  // Timezone combined with locale is a strong signal.
  // We override DateTimeFormat to always return UTC.
  const origDTF = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function (locales, options = {}) {
    options.timeZone = options.timeZone || 'UTC';
    return new origDTF(locales, options);
  };
  Intl.DateTimeFormat.prototype = origDTF.prototype;

  console.debug('[PrivacyBrowser] Anti-fingerprinting active.');

  // ── 9. DuckDuckGo cleanup and observation ─────────────────────────────────
  function removeElement(el) {
    if (!el || !el.parentNode) return;
    el.parentNode.removeChild(el);
  }

  function cleanupDuckDuckGo() {
    const stableSelectors = [
      'a[href*="duckduckgo.com/app"]',
      'a[href*="/bang"]',
      '[data-testid="header"]',
      'header[role="banner"]',
      'div[id^="promo"]',
      'div[aria-label*="Download the app"]',
      'section[aria-label*="Privacy Essentials"]',
      'div[data-testid*="feedback"], div[class*="feedback"]',
    ];

    let removed = 0;
    stableSelectors.forEach((sel) => {
      const nodes = document.querySelectorAll(sel);
      nodes.forEach((node) => { removeElement(node); removed += 1; });
    });

    const knownLogo = document.querySelector('a#logo_homepage_link, a.zcm__logo, img[alt="DuckDuckGo"]');
    if (knownLogo) { removeElement(knownLogo); removed += 1; }

    const mainHeader = document.querySelector('div.zcm, div#home_wrapper, div[data-testid="header"]');
    if (mainHeader) { mainHeader.style.marginTop = '0'; }

    return removed;
  }

  function observeDuckDuckGo() {
    const observer = new MutationObserver((mutations, obs) => {
      const cleaned = cleanupDuckDuckGo();
      if (cleaned > 0) {
        obs.disconnect();
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });

    // Initial cleanup attempt right away
    cleanupDuckDuckGo();
    setTimeout(() => observer.disconnect(), 3500);
  }

  function isDuckDuckGo() {
    return window.location.hostname.endsWith('duckduckgo.com');
  }

  function safeRemove(selector) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function cleanupDuckDuckGoAggressive() {
    if (!isDuckDuckGo()) return;

    // Remove homepage/promo elements
    const heroSelectors = [
      '#zci-wrapper',
      '.zcm',
      '.home__widgets',
      '.header__promo',
      '.header--app',
      '.js-homepage-signup',
      '.badge',
      'a[href*="duckduckgo.com/app"]',
      'a[href*="/app"]',
      'a[href*="/bang"]',
      'a[href*="/privacy"]',
      'div[data-testid*="promo"]',
      'div[class*="promo"]',
      'div[aria-label*="Download the app"]',
      'section[aria-label*="Privacy Essentials"]',
      'div[data-testid*="feedback"]',
      'button[aria-label*="Download"]',
      'img[alt="DuckDuckGo"]',
      'a#logo_homepage_link',
      'div#home_wrapper',
    ];

    heroSelectors.forEach(safeRemove);

    // remove any script-injected modals or popups by role/aria
    ['dialog[role="dialog"]', 'div[role="dialog"]', 'div[role="banner"]'].forEach((s) => {
      document.querySelectorAll(s).forEach((a) => {
        if (!a.classList.contains('search-results')) {
          safeRemove(a);
        }
      });
    });
  }

  function observeDuckDuckGo() {
    if (!isDuckDuckGo()) return;

    const observer = new MutationObserver(() => {
      cleanupDuckDuckGoAggressive();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });

    // Run immediately and rerun for a short period for dynamic content
    cleanupDuckDuckGoAggressive();
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts += 1;
      cleanupDuckDuckGoAggressive();
      if (attempts > 20) {
        clearInterval(intervalId);
        observer.disconnect();
      }
    }, 250);
    setTimeout(() => { clearInterval(intervalId); observer.disconnect(); }, 7000);
  }

  const textBasedHide = [
    'Make DuckDuckGo your default search engine',
    'Add our free extension to block web trackers',
    'Switch to DuckDuckGo',
    'Download',
    'Give feedback',
    'App download',
  ];

  function purgePromotionElements() {
    if (!isDuckDuckGo()) return;

    const unsafePatterns = [
      '.zcm', '.home__widgets', '.header__promo', '.global-header',
      '.home__container', '.app-cta', '.badge', '.ddg-sponsored',
      '.dax-suggestion', '.modal-' , '.popup', '.site-title'
    ];

    unsafePatterns.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => removeElement(el));
    });

    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (href.includes('/app') || href.includes('/bang') || href.includes('download')) {
        removeElement(a.closest('div') || a);
      }
    });

    document.querySelectorAll('button, a, div, section').forEach((el) => {
      const txt = (el.textContent || '').trim();
      textBasedHide.forEach((needle) => {
        if (txt.includes(needle)) removeElement(el);
      });
    });

    // remove any branded header row under banner
    ['header[role="banner"]', '.header'].forEach(sel => {
      document.querySelectorAll(sel).forEach(removeElement);
    });

    // hide fixed app promotion overlays
    const overlay = document.querySelector('div[role="dialog"], div[data-testid*="overlay"]');
    if (overlay) removeElement(overlay);

    // Last resort: remove any section containing strong promo text
    const promoTexts = [
      'Make DuckDuckGo your default search engine',
      'Add our free extension to block web trackers',
      'Switch to DuckDuckGo',
      'Download the app',
      'Protect your privacy',
    ];

    promoTexts.forEach((phrase) => {
      document.querySelectorAll('body *').forEach((el) => {
        if (el.children.length === 0 && el.textContent && el.textContent.includes(phrase)) {
          let root = el;
          for (let i = 0; i < 5; i += 1) {
            if (!root.parentElement) break;
            root = root.parentElement;
          }
          removeElement(root);
        }
      });
    });
  }

  function observeDuckDuckGo() {
    if (!isDuckDuckGo()) return;

    const observer = new MutationObserver(() => {
      purgePromotionElements();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'style', 'role', 'aria-label'],
    });

    purgePromotionElements();

    const tick = setInterval(() => {
      purgePromotionElements();
    }, 350);

    setTimeout(() => {
      clearInterval(tick);
      observer.disconnect();
    }, 10000);
  }

  window.addEventListener('DOMContentLoaded', observeDuckDuckGo);
  window.addEventListener('load', observeDuckDuckGo);
})();

// WebRTC RTCPeerConnection and getUserMedia complete lockdown

// Canvas fingerprint noise injection on getImageData and toDataURL

// AudioContext getChannelData sample jittering

// Navigator hardwareConcurrency (4) and deviceMemory (8) normalization
