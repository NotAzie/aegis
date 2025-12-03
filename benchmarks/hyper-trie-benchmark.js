const { performance } = require('perf_hooks');
const { AegisHyperTrie } = require('../src/engine/hyper-trie');

console.log('===========================================================');
console.log('  AegisHyperTrie V2 Dual-Tier Engine Extreme Benchmark     ');
console.log('===========================================================\n');

const trie = new AegisHyperTrie();

console.log('1. Loading 50,000 synthetic rules into Bitset + Trie...');
const t0 = performance.now();
for (let i = 0; i < 50000; i++) {
  trie.insert(`edge-surveillance-${i % 1000}.tracking-cdn-${i}.net`, 'tracker');
}
trie.insert('doubleclick.net', 'ad');
trie.insert('google-analytics.com', 'tracker');
trie.insert('facebook.net', 'tracker');
trie.insert('scorecardresearch.com', 'tracker');
const loadDuration = performance.now() - t0;
console.log(`✓ Ingested in ${loadDuration.toFixed(2)}ms (${trie.ruleCount} unique nodes)\n`);

const testQueries = [
  'doubleclick.net',
  'subdomain.ads.doubleclick.net',
  'google-analytics.com',
  'legit-news-portal.org',
  'github.com',
  'wikipedia.org',
  'edge-surveillance-42.tracking-cdn-2500.net',
  'deep.internal.edge-surveillance-100.tracking-cdn-900.net'
];

const ITERATIONS = 1000000;
console.log(`2. Executing ${ITERATIONS.toLocaleString()} continuous sub-microsecond queries...`);

const benchStart = performance.now();
let blockedMatches = 0;

for (let i = 0; i < ITERATIONS; i++) {
  const d = testQueries[i % testQueries.length];
  if (trie.matches(d)) {
    blockedMatches++;
  }
}

const elapsedMs = performance.now() - benchStart;
const opsPerSec = Math.round(ITERATIONS / (elapsedMs / 1000));
const avgLatencyNanos = ((elapsedMs * 1000000) / ITERATIONS).toFixed(1);

console.log('\n--- Benchmark Results ---');
console.log(`Total Ingested Rules:   ${trie.ruleCount.toLocaleString()}`);
console.log(`Queries Executed:       ${ITERATIONS.toLocaleString()}`);
console.log(`Elapsed Execution:      ${elapsedMs.toFixed(2)} ms`);
console.log(`Throughput:             ${opsPerSec.toLocaleString()} ops/second`);
console.log(`Average Latency:        ${avgLatencyNanos} nanoseconds / query`);
console.log(`Matches Verified:       ${blockedMatches.toLocaleString()}`);
console.log('===========================================================\n');
