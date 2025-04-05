const assert = require('assert');
console.log('Testing URL Normalizer & Query Stripper...');

function stripTrackingParameters(urlString) {
  try {
    const url = new URL(urlString);
    const TRACKING_PARAMS = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'mc_eid', 'ref', '_ga', 'twclid',
      'igshid', 'yclid', 'zanpid', 'dclid', 'srsltid'
    ];
    let modified = false;
    TRACKING_PARAMS.forEach(p => {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        modified = true;
      }
    });
    return modified ? url.toString() : urlString;
  } catch {
    return urlString;
  }
}

const test1 = 'https://example.com/?utm_source=twitter&fbclid=123&page=1';
assert.strictEqual(stripTrackingParameters(test1), 'https://example.com/?page=1');
console.log('✓ Query parameter sanitizer test passed.');
