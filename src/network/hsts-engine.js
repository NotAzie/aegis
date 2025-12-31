/**
 * HstsEngine — RFC 6797 Strict Transport Security Store
 */

const fs = require('fs');

class HstsEngine {
  constructor(preloadList = []) {
    this.preloadDomains = new Set(preloadList);
    this.dynamicRules = new Map(); // domain -> { expiry, includeSubdomains }
  }

  isSecure(domain) {
    if (!domain) return false;
    const clean = domain.toLowerCase().trim().replace(/^www\./, '');
    if (this.preloadDomains.has(clean)) return true;

    const rule = this.dynamicRules.get(clean);
    if (rule && rule.expiry > Date.now()) return true;

    // Check parent domains
    const parts = clean.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      const parentRule = this.dynamicRules.get(parent);
      if (parentRule && parentRule.includeSubdomains && parentRule.expiry > Date.now()) {
        return true;
      }
    }
    return false;
  }

  processHeader(domain, hstsHeader) {
    if (!hstsHeader || !domain) return;
    try {
      const directives = hstsHeader.split(';').map(d => d.trim().toLowerCase());
      let maxAge = 0;
      let includeSubdomains = false;

      for (let i = 0; i < directives.length; i++) {
        const d = directives[i];
        if (d.startsWith('max-age=')) {
          maxAge = parseInt(d.split('=')[1], 10);
        } else if (d === 'includesubdomains') {
          includeSubdomains = true;
        }
      }

      if (maxAge > 0) {
        const clean = domain.toLowerCase().trim().replace(/^www\./, '');
        this.dynamicRules.set(clean, {
          expiry: Date.now() + (maxAge * 1000),
          includeSubdomains
        });
      }
    } catch (e) {}
  }
}

module.exports = { HstsEngine };
