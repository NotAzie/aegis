// tests/unit/predictive-pipeline.test.js
const assert = require('assert');
const { PredictivePipeline } = require('../../src/engine/predictive-pipeline');

const mockDoh = { resolve: async () => '1.1.1.1' };
const mockGhost = { resolvePersona: () => ({ id: 'mock_cohort' }) };
const mockHsts = { isSecure: () => true };

const pipeline = new PredictivePipeline(mockDoh, mockGhost, mockHsts);
pipeline.preWarm('https://destination.com');

const warmed = pipeline.getWarmedState('https://destination.com');
assert(warmed !== null, 'Pre-warmed state must exist');
assert.strictEqual(warmed.persona.id, 'mock_cohort');
assert.strictEqual(warmed.isHttpsOnly, true);

pipeline.clear();
assert.strictEqual(pipeline.getWarmedState('https://destination.com'), null);

console.log('[PASS] PredictivePipeline unit test passed.');
