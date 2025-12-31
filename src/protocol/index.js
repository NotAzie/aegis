/**
 * @aegis-protocol/core — The Universal Privacy & Autonomous Security Protocol
 *
 * Exposes core algorithms as an extensible, enterprise-grade SDK for
 * desktop browsers, headless scrapers (Puppeteer/Playwright), and backend edge proxies.
 */

const { AegisHyperTrie } = require('../engine/hyper-trie');
const { EntropyShield } = require('../engine/entropy-shield');
const { GhostEngine, GOLDEN_COHORTS } = require('../engine/ghost-engine');
const { AdaptiveRuntime } = require('../meta/adaptive-runtime');
const { AegisAgent } = require('../agent/aegis-agent');
const { AegisToolbox } = require('../agent/toolbox');

const { PuppeteerStealthAdapter } = require('./adapters/puppeteer-stealth');
const { createHttpPrivacyProxy } = require('./adapters/http-proxy');

class AegisProtocol {
  constructor(options = {}) {
    this.options = options;
    this.hyperTrie = new AegisHyperTrie();
    this.entropyShield = new EntropyShield();
    this.ghostEngine = new GhostEngine();
    this.adaptiveRuntime = new AdaptiveRuntime();
    this.agent = new AegisAgent();
  }

  /**
   * Fast-path evaluation of an incoming request
   */
  evaluate(url, options = {}) {
    return this.adaptiveRuntime.safeguard(
      'protocol_eval',
      () => {
        const u = new URL(url);
        // 1. Heuristic check
        const entropyResult = this.entropyShield.inspect(url);
        if (entropyResult.suspicious) {
          this.agent.processEvent({ type: 'HIGH_ENTROPY_BEACON', origin: u.origin, severity: 0.85 });
          return { action: 'BLOCK', reason: entropyResult.reason, entropy: entropyResult.score };
        }
        // 2. Trie check
        if (this.hyperTrie.matches(u.hostname)) {
          return { action: 'BLOCK', reason: 'Trie block rule matched' };
        }
        return { action: 'ALLOW' };
      },
      () => ({ action: 'ALLOW', fallback: true })
    );
  }

  /**
   * Resolve hardware persona for headless stealth or browser injection
   */
  resolveStealthPersona(origin) {
    return this.ghostEngine.resolvePersona(origin);
  }
}

function createShield(options = {}) {
  return new AegisProtocol(options);
}

module.exports = {
  AegisProtocol,
  createShield,
  AegisHyperTrie,
  EntropyShield,
  GhostEngine,
  GOLDEN_COHORTS,
  AdaptiveRuntime,
  AegisAgent,
  AegisToolbox,
  PuppeteerStealthAdapter,
  createHttpPrivacyProxy
};
