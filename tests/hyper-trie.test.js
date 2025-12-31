const assert = require('assert');
const { AegisHyperTrie, FastBitset, murmur3 } = require('../src/engine/hyper-trie');

console.log('Running AegisHyperTrie V2 Unit Verification Suite...');

// 1. Bitset verification
const bitset = new FastBitset(1024);
bitset.add(42);
bitset.add(999);
assert.strictEqual(bitset.has(42), true);
assert.strictEqual(bitset.has(999), true);
assert.strictEqual(bitset.has(100), false);
console.log('[PASS] Bitset operations verified');

// 2. HyperTrie verification
const trie = new AegisHyperTrie();
trie.insert('doubleclick.net', 'ad');
trie.insert('google-analytics.com', 'tracker');
trie.insert('stats.adservice.google.com', 'ad');

// Exact match
assert.strictEqual(trie.matches('doubleclick.net'), true);
assert.strictEqual(trie.matches('google-analytics.com'), true);
assert.strictEqual(trie.matches('stats.adservice.google.com'), true);

// Subdomain inheritance match
assert.strictEqual(trie.matches('ad.doubleclick.net'), true);
assert.strictEqual(trie.matches('deep.nested.sub.google-analytics.com'), true);

// Clean non-blocked domains
assert.strictEqual(trie.matches('google.com'), false);
assert.strictEqual(trie.matches('wikipedia.org'), false);
assert.strictEqual(trie.matches('github.com'), false);
assert.strictEqual(trie.matches('notdoubleclick.net'), false);

console.log('[PASS] All AegisHyperTrie assertions passed with zero defects!');
