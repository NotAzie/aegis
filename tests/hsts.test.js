const assert = require('assert');

console.log('Running HSTS Directives & Expiration Logic Tests...');

function parseHstsHeader(header) {
  if (!header) return null;
  const directives = header.split(';').map(d => d.trim().toLowerCase());
  let maxAge = 0;
  let includeSubdomains = false;

  for (const directive of directives) {
    if (directive.startsWith('max-age=')) {
      maxAge = parseInt(directive.split('=')[1], 10);
    } else if (directive === 'includesubdomains') {
      includeSubdomains = true;
    }
  }

  if (maxAge > 0) {
    return { maxAge, includeSubdomains, expiry: Date.now() + (maxAge * 1000) };
  }
  return null;
}

const rule1 = parseHstsHeader('max-age=31536000; includeSubDomains; preload');
assert.strictEqual(rule1.maxAge, 31536000);
assert.strictEqual(rule1.includeSubdomains, true);
assert(rule1.expiry > Date.now());

const rule2 = parseHstsHeader('max-age=0');
assert.strictEqual(rule2, null, 'max-age=0 should not produce an active rule');

console.log('[PASS] All HSTS logic tests passed successfully!');
