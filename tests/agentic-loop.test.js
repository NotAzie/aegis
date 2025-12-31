const assert = require('assert');
const { AegisAgent } = require('../src/agent/aegis-agent');
const { AegisToolbox } = require('../src/agent/toolbox');

console.log('Running AegisAgent ReAct Loop & Toolbox Verification Suite...');

const toolbox = new AegisToolbox();
const agent = new AegisAgent(toolbox);

// 1. Hostile probe scenario
agent.processEvent({
  type: 'AGGRESSIVE_FINGERPRINT_BURST',
  origin: 'https://telemetry-vector.biz',
  severity: 0.95
}).then(decision => {
  assert.strictEqual(decision.thoughts.length, 1);
  assert.strictEqual(decision.actions.length, 2);
  assert.strictEqual(toolbox.isIsolated('https://telemetry-vector.biz'), true);
  assert(toolbox.honeyTokens.has('https://telemetry-vector.biz'));
  console.log('[PASS] Hostile probe ReAct countermeasure verified');

  // 2. High-entropy zero-day scenario
  return agent.processEvent({
    type: 'HIGH_ENTROPY_BEACON',
    origin: 'https://c8f93c0b1.adnetwork.io',
    severity: 0.85
  });
}).then(decision => {
  assert.strictEqual(decision.actions.length, 1);
  assert(toolbox.poisonedVectors.has('https://c8f93c0b1.adnetwork.io'));
  console.log('[PASS] Zero-day poison vector dispatch verified');
  console.log('[PASS] All AegisAgent reasoning tests passed with zero defects!');
});
