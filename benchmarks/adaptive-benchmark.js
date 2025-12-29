const { performance } = require('perf_hooks');
const { AdaptiveRuntime } = require('../src/meta/adaptive-runtime');

console.log('===========================================================');
console.log('  AdaptiveRuntime Self-Optimization & Healing Benchmark   ');
console.log('===========================================================\n');

const runtime = new AdaptiveRuntime();

console.log('1. Benchmarking zero-overhead safeguard execution...');
const N = 1000000;
const start = performance.now();
let sum = 0;

for (let i = 0; i < N; i++) {
  sum += runtime.safeguard('core_pipeline', () => i & 1, () => 0);
  if (i % 10000 === 0) {
    runtime.recordLatency(120);
    runtime.evaluateRuntimeStrategy();
  }
}

const elapsed = performance.now() - start;
console.log(`Executed ${N.toLocaleString()} iterations in ${elapsed.toFixed(2)}ms`);
console.log(`Throughput: ${Math.round(N / (elapsed / 1000)).toLocaleString()} ops/second`);
console.log(`Average Latency: ${((elapsed * 1000) / N).toFixed(4)} µs/call`);
console.log(`Current Adaptive Mode: ${runtime.metrics.mode}\n`);

console.log('2. Simulating failure burst & zero-downtime healing...');
let failCount = 0;
for (let i = 0; i < 10; i++) {
  runtime.safeguard(
    'unstable_service',
    () => { failCount++; throw new Error('Network fault'); },
    () => 'SAFE_FALLBACK'
  );
}
console.log(`Circuit State: ${runtime.getCircuit('unstable_service').state}`);
console.log(`Total Auto-Healed Events: ${runtime.metrics.healedEvents}`);
console.log('===========================================================\n');
