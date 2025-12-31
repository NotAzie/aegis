/**
 * PredictivePipeline — Speculative Pre-Warming & Threat Forecasting
 *
 * Predicts upcoming origin navigations, pre-resolves DoH entries,
 * pre-calculates GhostEngine personas, and validates HSTS status
 * to eliminate cold-start hop latency.
 */

class PredictivePipeline {
  constructor(dohResolver, ghostEngine, hstsEngine) {
    this.doh = dohResolver;
    this.ghost = ghostEngine;
    this.hsts = hstsEngine;
    this.warmCache = new Map();
  }

  preWarm(origin) {
    if (!origin || this.warmCache.has(origin)) return;

    try {
      const u = new URL(origin);
      const persona = this.ghost ? this.ghost.resolvePersona(u.origin) : null;
      const isHttpsOnly = this.hsts ? this.hsts.isSecure(u.hostname) : true;

      this.warmCache.set(origin, {
        persona,
        isHttpsOnly,
        preWarmedAt: Date.now()
      });

      if (this.doh) {
        this.doh.resolve(u.hostname).catch(() => {});
      }
    } catch (e) {}
  }

  getWarmedState(origin) {
    return this.warmCache.get(origin) || null;
  }

  clear() {
    this.warmCache.clear();
  }
}

module.exports = { PredictivePipeline };
