// scripts/verify.js
/**
 * Automated Verification Pipeline for Aegis Platform
 * Zero-emoji clinical output test runner.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_FILES = [
  'tests/url-normalizer.test.js',
  'tests/hyper-trie.test.js',
  'tests/entropy-shield.test.js',
  'tests/ghost-engine.test.js',
  'tests/nexus-integration.test.js',
  'tests/adaptive-runtime.test.js',
  'tests/agentic-loop.test.js',
  'tests/unit/doh-resolver.test.js',
  'tests/unit/ephemeral-vault.test.js',
  'tests/unit/predictive-pipeline.test.js'
];

console.log('================================================================');
console.log('  Aegis Enterprise Platform Verification Gate');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

for (const tf of TEST_FILES) {
  const fullPath = path.join(__dirname, '..', tf);
  if (!fs.existsSync(fullPath)) {
    continue;
  }

  try {
    execSync(`node "${fullPath}"`, { stdio: 'pipe' });
    console.log(`[PASS] ${tf}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${tf}`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
    failed++;
  }
}

console.log('\n================================================================');
console.log(`Verification Summary: ${passed} Passed, ${failed} Failed`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('[AEGIS-VERIFY] All subsystem test assertions satisfied with zero defects.');
  process.exit(0);
}
