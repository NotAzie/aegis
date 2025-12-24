const assert = require('assert');
const { AegisHyperTrie } = require('../src/engine/hyper-trie');
const { EntropyShield } = require('../src/engine/entropy-shield');
const { GhostEngine } = require('../src/engine/ghost-engine');

console.log('Running Nexus V2 Core Subsystem Integration Tests...');

// 1. Verify HyperTrie + EntropyShield synergy
const trie = new AegisHyperTrie();
trie.insert('surveillance-network.com', 'tracker');
const entropy = new EntropyShield();

function evaluateRequest(url) {
  const parsed = new URL(url);
  if (entropy.inspect(url).suspicious) return 'BLOCKED_ENTROPY';
  if (trie.matches(parsed.hostname)) return 'BLOCKED_TRIE';
  return 'ALLOW';
}

assert.strictEqual(evaluateRequest('https://surveillance-network.com/tag.js'), 'BLOCKED_TRIE');
assert.strictEqual(evaluateRequest('https://a9f82d1c0b93.client-cdn.com/pixel'), 'BLOCKED_ENTROPY');
assert.strictEqual(evaluateRequest('https://en.wikipedia.org/wiki/Zero-knowledge_proof'), 'ALLOW');

// 2. GhostEngine integration
const ghost = new GhostEngine(42);
const persona = ghost.resolvePersona('https://en.wikipedia.org');
assert(persona.renderer !== undefined, 'Persona must provide valid renderer');
assert(persona.screen.width >= 1728, 'Persona screen must meet standard specs');

console.log('✓ Nexus V2 Subsystem Integration Verified 100% operational!');
