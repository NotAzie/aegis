/**
 * EntropyShield — Real-Time Shannon Entropy & Token Anomaly Heuristic
 *
 * Eliminates reliance on static blocklists by detecting:
 * - Ephemeral CNAME tracking subdomains
 * - High-entropy fingerprint digests and UUID tracking beacons
 * - Obfuscated surveillance payloads
 */

function calculateShannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const len = str.length;
  const freqs = new Map();
  for (let i = 0; i < len; i++) {
    const ch = str.charCodeAt(i);
    freqs.set(ch, (freqs.get(ch) || 0) + 1);
  }

  let entropy = 0;
  for (const count of freqs.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_TOKEN_PATTERN = /^[0-9a-f]{16,}$/i;
const BASE64_TOKEN_PATTERN = /^[A-Za-z0-9+/=._-]{24,}$/;

class EntropyShield {
  constructor(options = {}) {
    this.entropyThreshold = options.entropyThreshold || 3.4;
    this.minTokenLength = options.minTokenLength || 12;
    this.inspectedCount = 0;
    this.blockedCount = 0;
  }

  inspect(urlString) {
    this.inspectedCount++;
    if (!urlString || typeof urlString !== 'string') {
      return { suspicious: false, score: 0, reason: null };
    }

    let url;
    try {
      url = new URL(urlString);
    } catch {
      return { suspicious: false, score: 0, reason: null };
    }

    const hostname = url.hostname.toLowerCase();
    const parts = hostname.split('.');

    // 1. CNAME Subdomain Randomness Check
    if (parts.length > 2) {
      for (let i = 0; i < parts.length - 2; i++) {
        const sub = parts[i];
        if (sub.length >= this.minTokenLength) {
          const entropy = calculateShannonEntropy(sub);
          const hasMixedDigitsAndLetters = /[0-9]/.test(sub) && /[a-z]/.test(sub);
          if (entropy >= this.entropyThreshold && hasMixedDigitsAndLetters) {
            this.blockedCount++;
            return {
              suspicious: true,
              score: entropy,
              reason: `High-entropy CNAME tracking subdomain: "${sub}" (entropy: ${entropy.toFixed(2)})`
            };
          }
        }
      }
    }

    // 2. Query Parameter Fingerprint & Beacon Inspection
    for (const [key, val] of url.searchParams.entries()) {
      if (val.length >= this.minTokenLength) {
        if (UUID_PATTERN.test(val)) {
          this.blockedCount++;
          return {
            suspicious: true,
            score: 4.0,
            reason: `UUID tracking telemetry payload in parameter "${key}"`
          };
        }
        if (HEX_TOKEN_PATTERN.test(val) || BASE64_TOKEN_PATTERN.test(val)) {
          const entropy = calculateShannonEntropy(val);
          if (entropy >= 3.8) {
            this.blockedCount++;
            return {
              suspicious: true,
              score: entropy,
              reason: `High-entropy serialized telemetry token in parameter "${key}" (entropy: ${entropy.toFixed(2)})`
            };
          }
        }
      }
    }

    return { suspicious: false, score: 0, reason: null };
  }
}

module.exports = { EntropyShield, calculateShannonEntropy };
