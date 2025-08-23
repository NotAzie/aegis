const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running Blocklist & Domain Matching Unit Tests...');

const adBlocklistPath = path.join(__dirname, '..', 'src', 'blocklists', 'ad-blocklist.json');
const trackerBlocklistPath = path.join(__dirname, '..', 'src', 'blocklists', 'tracker-blocklist.json');

assert(fs.existsSync(adBlocklistPath), 'ad-blocklist.json should exist');
assert(fs.existsSync(trackerBlocklistPath), 'tracker-blocklist.json should exist');

const adList = JSON.parse(fs.readFileSync(adBlocklistPath, 'utf8'));
const trackerList = JSON.parse(fs.readFileSync(trackerBlocklistPath, 'utf8'));

assert(Array.isArray(adList) && adList.length > 0, 'adList should be a non-empty array');
assert(Array.isArray(trackerList) && trackerList.length > 0, 'trackerList should be a non-empty array');

const adSet = new Set(adList.map(s => s.toLowerCase()));
const trackerSet = new Set(trackerList.map(s => s.toLowerCase()));

function isDomainBlocked(host, sets) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  for (const s of sets) {
    if (s.has(h)) return true;
    const parts = h.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (s.has(parts.slice(i).join('.'))) return true;
    }
  }
  return false;
}

assert(isDomainBlocked('doubleclick.net', [adSet]), 'doubleclick.net must be blocked');
assert(isDomainBlocked('sub.doubleclick.net', [adSet]), 'sub.doubleclick.net must be blocked');
assert(isDomainBlocked('google-analytics.com', [trackerSet]), 'google-analytics.com must be blocked');
assert(isDomainBlocked('ssl.google-analytics.com', [trackerSet]), 'ssl.google-analytics.com must be blocked');
assert(!isDomainBlocked('wikipedia.org', [adSet, trackerSet]), 'wikipedia.org must NOT be blocked');
assert(!isDomainBlocked('github.com', [adSet, trackerSet]), 'github.com must NOT be blocked');

console.log('✓ All Blocklist unit tests passed successfully!');
