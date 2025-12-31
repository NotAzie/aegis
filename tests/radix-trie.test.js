const assert = require('assert');
const { FastDomainTrie } = require('../src/engine/radix-trie');
const { FastMatcher } = require('../src/engine/fast-matcher');

console.log('Running FastDomainTrie and FastMatcher Unit Tests...');

const trie = new FastDomainTrie();
trie.insert('doubleclick.net', 'ad');
trie.insert('google-analytics.com', 'tracker');
trie.insert('adservice.google.com', 'ad');

// Exact matches
assert.strictEqual(trie.matches('doubleclick.net').blocked, true);
assert.strictEqual(trie.matches('google-analytics.com').blocked, true);

// Subdomain matches
assert.strictEqual(trie.matches('secure.doubleclick.net').blocked, true);
assert.strictEqual(trie.matches('deep.nested.sub.doubleclick.net').blocked, true);
assert.strictEqual(trie.matches('adservice.google.com').blocked, true);

// Clean non-blocked domains
assert.strictEqual(trie.matches('google.com').blocked, false);
assert.strictEqual(trie.matches('notdoubleclick.net').blocked, false);
assert.strictEqual(trie.matches('wikipedia.org').blocked, false);

// FastMatcher with cache
const matcher = new FastMatcher(50);
matcher.insertRule('telemetry.microsoft.com', 'tracker');
assert.strictEqual(matcher.isBlocked('telemetry.microsoft.com'), true);
assert.strictEqual(matcher.isBlocked('sub.telemetry.microsoft.com'), true);
assert.strictEqual(matcher.isBlocked('microsoft.com'), false);

// Hit cache verification
assert.strictEqual(matcher.isBlocked('telemetry.microsoft.com'), true);

console.log('[PASS] All Trie & Matcher tests passed successfully!');
