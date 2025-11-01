# 🏛️ PrivacyBrowser Architecture Whitepaper

## 1. System Overview
PrivacyBrowser is an enterprise-grade hardened desktop browser engineered to eliminate web telemetry, fingerprinting, and unencrypted transmission vectors.

```
+-------------------------------------------------------------------------+
|                          MAIN PROCESS (Node.js)                         |
|                                                                         |
|  [ FastMatcher Engine ]  <--->  [ Strict HTTPS / HSTS Engine ]           |
|  - FastDomainTrie (O(1))        - RFC 6797 Preload Registry             |
|  - 10k LRU Hot Cache            - Zero Insecure Fallback Enforcement    |
|                                                                         |
|  [ Isolated Session Controller ]                                        |
|  - partition: 'memory:' (Zero Disk Leak Storage)                        |
|  - WebRTC UDP Non-Proxied Leak Neutralizer                              |
+------------------------------------+------------------------------------+
                                     | IPC (contextBridge)
                                     v
+------------------------------------+------------------------------------+
|               RENDERER 1           |             RENDERER 2             |
|        (BrowserWindow Chrome)      |        (WebContentsView Content)   |
|                                    |                                    |
| - Custom Glassmorphism Toolbar     | - Injected Anti-Fingerprint Preload |
| - Omnibox & URL Normalizer         |   * Canvas Noise Poisoning         |
| - Live Privacy Shield Radar Popover|   * AudioContext Jitter            |
| - Zero Node.js Access              |   * Screen & Navigator Normalizing |
+------------------------------------+------------------------------------+
```

## 2. Core Pillars

### 2.1 O(1) Suffix Domain Trie Matching
Instead of regex-based evaluation or linear array scans across 100,000+ domain entries, PrivacyBrowser implements `FastDomainTrie`. Domain labels are traversed in reverse order (`net` -> `doubleclick`), allowing sub-millisecond evaluation in $O(k)$ where $k$ is label depth ($k \le 4$).

### 2.2 Strict HTTPS-Only & HSTS Enforcement
HTTP connections are intercepted at the protocol layer and upgraded. Insecure form submissions (HTTPS -> HTTP POST) and mixed subresources are rejected with zero user bypass capabilities.

### 2.3 DOM-Level Anti-Fingerprinting Shield
Before any webpage JavaScript executes, `content-preload.js` seeds deterministic noise into Canvas exports, adds jitter to Web Audio samples, locks screen geometries to standard 1080p dimensions, and overrides WebRTC RTCPeerConnection to prevent local/public IP leakage.

### 2.4 Zero Storage Footprint
All user sessions execute in private memory partitions (`partition: 'memory:'`). On exit, all caches, cookies, IndexedDB, and WebSQL entries are wiped from memory.
