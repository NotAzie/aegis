/**
 * AegisToolbox — Autonomous Active Countermeasure Toolchain
 */

class AegisToolbox {
  constructor() {
    this.isolatedOrigins = new Set();
    this.honeyTokens = new Map();
    this.suppressedBounces = new Set();
    this.poisonedVectors = new Map();
  }

  isolateOrigin(origin) {
    if (!origin) return { status: 'IGNORED' };
    this.isolatedOrigins.add(origin.toLowerCase());
    return { status: 'ISOLATED', origin };
  }

  deployHoneyToken(origin, tokenData) {
    if (!origin) return { status: 'IGNORED' };
    this.honeyTokens.set(origin.toLowerCase(), {
      token: tokenData || 'aegis_decoy_' + Math.random().toString(36).substring(2),
      deployedAt: Date.now()
    });
    return { status: 'HONEYTOKEN_ACTIVE', origin };
  }

  suppressBounceTracking(url) {
    if (!url) return { status: 'IGNORED' };
    this.suppressedBounces.add(url);
    return { status: 'BOUNCE_NEUTRALIZED', url };
  }

  injectPoisonVector(origin, canvasSeed) {
    this.poisonedVectors.set(origin.toLowerCase(), canvasSeed || 0xdeadbeef);
    return { status: 'POISON_VECTOR_DEPLOYED', origin };
  }

  isIsolated(origin) {
    return this.isolatedOrigins.has((origin || '').toLowerCase());
  }
}

module.exports = { AegisToolbox };
