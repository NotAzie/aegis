/**
 * content-preload.js — V2 GhostEngine Client-Side Protection Shield
 *
 * Injected prior to any page JavaScript execution.
 * Enforces mathematically coherent synthetic hardware cohorts and WebRTC lockdown.
 */

(function () {
  'use strict';

  // 1. WebRTC Neutralization (hard leak shield)
  try {
    const BlockedRTC = function() {
      throw new Error('[Aegis:WebRTC] UDP connection blocked for privacy protection');
    };
    Object.defineProperty(window, 'RTCPeerConnection', { value: BlockedRTC, writable: false, configurable: false });
    Object.defineProperty(window, 'webkitRTCPeerConnection', { value: BlockedRTC, writable: false, configurable: false });
    if (window.RTCSessionDescription) {
      Object.defineProperty(window, 'RTCSessionDescription', { value: BlockedRTC, writable: false, configurable: false });
    }
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('[Aegis:Media] Media access restricted'));
    }
  } catch (e) {}

  // 2. Synthesize Deterministic Origin Persona
  const origin = window.location.origin || 'https://unknown.local';
  let hash = 0x5bd1e995 ^ origin.length;
  for (let i = 0; i < origin.length; i++) {
    hash = Math.imul(hash ^ origin.charCodeAt(i), 0x5bd1e995);
    hash ^= hash >>> 13;
  }
  const COHORTS = [
    { renderer: 'Apple M3 Max', vendor: 'Apple Inc.', platform: 'MacIntel', cpu: 14, mem: 36, w: 1728, h: 1117 },
    { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)', vendor: 'Google Inc. (NVIDIA)', platform: 'Win32', cpu: 16, mem: 32, w: 1920, h: 1080 },
    { renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', vendor: 'Google Inc. (Intel)', platform: 'Win32', cpu: 8, mem: 16, w: 1920, h: 1200 },
    { renderer: 'AMD Radeon 780M (RADV GFX1103_R1)', vendor: 'Mesa', platform: 'Linux x86_64', cpu: 16, mem: 32, w: 2256, h: 1504 }
  ];
  const persona = COHORTS[(hash >>> 0) % COHORTS.length];

  // 3. WebGL Unmasked Hardware Spoof
  try {
    const origGetParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 0x9245) return persona.vendor;    // UNMASKED_VENDOR_WEBGL
      if (param === 0x9246) return persona.renderer;  // UNMASKED_RENDERER_WEBGL
      return origGetParam.apply(this, arguments);
    };
    if (window.WebGL2RenderingContext) {
      const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        if (param === 0x9245) return persona.vendor;
        if (param === 0x9246) return persona.renderer;
        return origGetParam2.apply(this, arguments);
      };
    }
  } catch (e) {}

  // 4. Metric Normalisation (Screen, Platform, Concurrency)
  try {
    Object.defineProperty(navigator, 'platform', { get: () => persona.platform, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => persona.cpu, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => persona.mem, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0, configurable: true });

    Object.defineProperty(screen, 'width', { get: () => persona.w, configurable: true });
    Object.defineProperty(screen, 'height', { get: () => persona.h, configurable: true });
    Object.defineProperty(screen, 'availWidth', { get: () => persona.w, configurable: true });
    Object.defineProperty(screen, 'availHeight', { get: () => persona.h - 40, configurable: true });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
  } catch (e) {}

  // 5. AudioContext Harmonic Jitter
  try {
    if (window.AudioBuffer) {
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function() {
        const data = origGetChannelData.apply(this, arguments);
        for (let i = 0; i < data.length; i += 64) {
          data[i] += 0.000005;
        }
        return data;
      };
    }
  } catch (e) {}

  // 6. Restrict Font Enumeration & UTC Timezone
  try {
    const ALLOWED_FONTS = new Set(['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana', 'sans-serif', 'serif', 'monospace']);
    if (document.fonts && document.fonts.check) {
      const origCheck = document.fonts.check.bind(document.fonts);
      document.fonts.check = function(font, text) {
        const match = font.match(/"([^"]+)"|'([^']+)'|(\S+)$/);
        const family = match ? (match[1] || match[2] || match[3]) : '';
        return ALLOWED_FONTS.has(family) ? origCheck(font, text) : false;
      };
    }
    const origDTF = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(locales, options = {}) {
      options.timeZone = options.timeZone || 'UTC';
      return new origDTF(locales, options);
    };
    Intl.DateTimeFormat.prototype = origDTF.prototype;
  } catch (e) {}

  console.debug('[Aegis:GhostEngine] Synthetic cohort active:', persona.renderer);
})();
