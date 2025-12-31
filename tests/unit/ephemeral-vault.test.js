// tests/unit/ephemeral-vault.test.js
const assert = require('assert');
const { EphemeralVault } = require('../../src/storage/ephemeral-vault');

const vault = new EphemeralVault();
vault.set('https://origin-a.com', 'session_id', { token: 'alpha_secure' });
vault.set('https://origin-b.com', 'session_id', { token: 'beta_secure' });

assert.strictEqual(vault.get('https://origin-a.com', 'session_id').token, 'alpha_secure');
assert.strictEqual(vault.get('https://origin-b.com', 'session_id').token, 'beta_secure');

// Origin cross-read prevention
assert.strictEqual(vault.get('https://origin-c.com', 'session_id'), null);

vault.purge();
assert.strictEqual(vault.partitions.size, 0);

console.log('[PASS] EphemeralVault unit test passed.');
