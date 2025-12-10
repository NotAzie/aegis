const { performance } = require('perf_hooks');
const { EntropyShield } = require('../src/engine/entropy-shield');

console.log('===========================================================');
console.log('  EntropyShield Heuristic Engine Micro-Benchmark          ');
console.log('===========================================================\n');

const shield = new EntropyShield();

const testUrls = [
  'https://en.wikipedia.org/wiki/Computer_science?query=algorithms',
  'https://c8f1e290ba78d31.cdn-tracker.news.com/pixel.gif',
  'https://github.com/NotAzie/privacybrowser?tab=readme-ov-file',
  'https://analytics.site.com/collect?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.s7df68s7dfs',
  'https://duckduckgo.com/?q=quantum+computing+algorithms',
  'https://telemetry.edge.net/beacon?session_id=123e4567-e89b-12d3-a456-426614174000'
];

const ITERATIONS = 200000;
console.log(`Executing ${ITERATIONS.toLocaleString()} dynamic URL entropy inspections...`);

const start = performance.now();
let detectedCount = 0;

for (let i = 0; i < ITERATIONS; i++) {
  const u = testUrls[i % testUrls.length];
  const res = shield.inspect(u);
  if (res.suspicious) detectedCount++;
}

const elapsedMs = performance.now() - start;
const opsPerSec = Math.round(ITERATIONS / (elapsedMs / 1000));
const avgLatencyMicros = ((elapsedMs * 1000) / ITERATIONS).toFixed(3);

console.log('\n--- Benchmark Results ---');
console.log(`Inspections:        ${ITERATIONS.toLocaleString()}`);
console.log(`Elapsed Time:       ${elapsedMs.toFixed(2)} ms`);
console.log(`Throughput:         ${opsPerSec.toLocaleString()} ops/second`);
console.log(`Average Latency:    ${avgLatencyMicros} µs / URL`);
console.log(`Anomalies Detected: ${detectedCount.toLocaleString()}`);
console.log('===========================================================\n');
