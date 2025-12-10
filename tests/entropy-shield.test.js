const assert = require('assert');
const { EntropyShield, calculateShannonEntropy } = require('../src/engine/entropy-shield');

console.log('Running EntropyShield Unit Verification Suite...');

// 1. Math verification
const lowEntropy = calculateShannonEntropy('aaaaaa');
const highEntropy = calculateShannonEntropy('a8f93c0b1e4d');
assert(lowEntropy === 0, 'Uniform character string must have zero entropy');
assert(highEntropy > 3.0, 'Dispersed hex token must have high entropy');

// 2. Real-world heuristic inspection
const shield = new EntropyShield();

// Clean URLs
const clean1 = shield.inspect('https://wikipedia.org/wiki/Algorithm');
const clean2 = shield.inspect('https://github.com/trending?since=daily');
assert.strictEqual(clean1.suspicious, false, 'Legitimate URL must not be flagged');
assert.strictEqual(clean2.suspicious, false, 'Legitimate query params must not be flagged');

// CNAME tracking subdomain
const cnameTrack = shield.inspect('https://a8f93bc20d1e45b.tracking-service.com/beacon');
assert.strictEqual(cnameTrack.suspicious, true, 'High-entropy subdomain must be flagged');

// Telemetry UUID payload
const uuidTrack = shield.inspect('https://tracker.net/collect?uid=c0ffee00-1337-4242-8888-0123456789ab');
assert.strictEqual(uuidTrack.suspicious, true, 'UUID tracking token must be flagged');

// Serialized base64 token
const base64Track = shield.inspect('https://analytics.com/log?payload=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz123');
assert.strictEqual(base64Track.suspicious, true, 'Base64 telemetry digest must be flagged');

console.log('✓ All EntropyShield heuristic assertions passed with zero defects!');
