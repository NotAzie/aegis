const assert = require('assert');
const { AdaptiveRuntime, CircuitBreaker } = require('../src/meta/adaptive-runtime');

console.log('Running AdaptiveRuntime & CircuitBreaker Unit Verification Suite...');

// 1. Circuit breaker transitions
const cb = new CircuitBreaker('test_subsystem', 2, 50);
assert.strictEqual(cb.state, 'CLOSED');
assert.strictEqual(cb.canExecute(), true);

cb.recordFailure();
assert.strictEqual(cb.state, 'CLOSED');
cb.recordFailure();
assert.strictEqual(cb.state, 'OPEN', 'Breaker must trip to OPEN after threshold failures');
assert.strictEqual(cb.canExecute(), false, 'Breaker must block execution while OPEN');

// 2. Safeguard fallback logic
const runtime = new AdaptiveRuntime({ memoryThreshold: 0.95 });
const normal = runtime.safeguard('math', () => 100, () => 0);
assert.strictEqual(normal, 100);

const fallback = runtime.safeguard('failing', () => { throw new Error('Crash'); }, () => 42);
assert.strictEqual(fallback, 42);
assert.strictEqual(runtime.metrics.healedEvents, 1);

// 3. Adaptive Strategy Evaluation
const mode = runtime.evaluateRuntimeStrategy();
assert(['HYPER_DRIVE', 'ADAPTIVE_BALANCED', 'CONSERVATIVE'].includes(mode));

console.log('✓ All AdaptiveRuntime self-healing tests passed with zero defects!');
