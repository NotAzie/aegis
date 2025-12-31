/**
 * Aegis System Security Configuration
 * Baseline parameters for network interception, DoH, and ephemeral storage.
 */

module.exports = {
  network: {
    enforceHttpsStrict: true,
    dohEndpoints: [
      'https://cloudflare-dns.com/dns-query',
      'https://dns.quad9.net/dns-query'
    ],
    webrtcPolicy: 'disable_non_proxied_udp',
    dnsCacheTtlMs: 300000
  },
  engine: {
    bloomBitsetSize: 262144, // 256 KB
    entropyThreshold: 3.4,
    minTokenLength: 12
  },
  storage: {
    algorithm: 'aes-256-gcm',
    purgeOnExit: true
  }
};
