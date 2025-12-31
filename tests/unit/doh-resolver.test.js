// tests/unit/doh-resolver.test.js
const assert = require('assert');
const { DohResolver } = require('../../src/network/doh-resolver');

const resolver = new DohResolver();
const query = resolver._encodeDnsQuery('example.com');

assert(query instanceof Buffer, 'Query packet must be a Buffer instance');
assert(query.length > 12, 'Query packet must be larger than DNS header');
assert.strictEqual(query.readUInt16BE(0), 0x1337);

resolver.resolve('example.com').then(ip => {
  assert(typeof ip === 'string', 'Resolved IP must be string');
  console.log('[PASS] DohResolver unit test passed.');
});
