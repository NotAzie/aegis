/**
 * PuppeteerStealthAdapter — Universal Headless Stealth Driver
 *
 * Injects mathematically coherent GhostEngine personas into Playwright / Puppeteer
 * page contexts, defeating advanced bot detection systems (Cloudflare, Datadome, Akamai).
 */

class PuppeteerStealthAdapter {
  static async apply(page, persona) {
    if (!page || typeof page.evaluateOnNewDocument !== 'function') return;

    await page.evaluateOnNewDocument((p) => {
      // 1. Override WebGL
      const origGetParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 0x9245) return p.vendor;
        if (param === 0x9246) return p.renderer;
        return origGetParam.apply(this, arguments);
      };

      // 2. Screen & Navigator
      Object.defineProperty(navigator, 'platform', { get: () => p.platform });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => p.hardwareConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => p.deviceMemory });
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // 3. AudioContext Jitter
      if (window.AudioBuffer) {
        const origGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function() {
          const data = origGetChannelData.apply(this, arguments);
          for (let i = 0; i < data.length; i += 64) data[i] += (p.audioOffset || 0.000005);
          return data;
        };
      }
    }, persona);
  }
}

module.exports = { PuppeteerStealthAdapter };
