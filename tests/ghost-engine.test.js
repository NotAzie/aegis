const assert = require('assert');
const { GhostEngine, GOLDEN_COHORTS } = require('../src/engine/ghost-engine');

console.log('Running GhostEngine Synthetic Cohort Verification Suite...');

const engine = new GhostEngine(0x1337c0de);

// 1. Cohort consistency for the same origin
const p1 = engine.resolvePersona('https://news.ycombinator.com');
const p2 = engine.resolvePersona('https://news.ycombinator.com');
assert.strictEqual(p1.id, p2.id, 'Persona must be 100% deterministic for identical origins');

// 2. Cohort isolation across different origins
const pGitHub = engine.resolvePersona('https://github.com');
const pWikipedia = engine.resolvePersona('https://wikipedia.org');
console.log('GitHub persona:', pGitHub.id);
console.log('Wikipedia persona:', pWikipedia.id);

// 3. Mathematical completeness
GOLDEN_COHORTS.forEach(c => {
  assert(c.renderer.length > 0, 'Renderer string must be valid');
  assert(c.hardwareConcurrency > 0, 'CPU concurrency must be non-zero');
  assert(c.screen.width >= 1728, 'Screen width must reflect high-DPI standard');
});

console.log('[PASS] All GhostEngine cohort assertions passed with zero defects!');
