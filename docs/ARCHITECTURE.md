# Architecture Whitepaper: Aegis Platform Specification

## 1. System Topology

The Aegis architecture decouples request ingestion, algorithmic evaluation, and presentation layers into strictly isolated boundaries.

```
+-----------------------------------------------------------------------------+
|                              PROCESS ARCHITECTURE                           |
|                                                                             |
|  [ Core Micro-Kernel ] (src/main.js)                                        |
|         |                                                                   |
|         v                                                                   |
|  [ Nexus Master Engine ] (src/core/nexus.js)                                |
|    +-- AegisHyperTrie (src/engine/hyper-trie.js)                            |
|    +-- EntropyShield (src/engine/entropy-shield.js)                         |
|    +-- GhostEngine (src/engine/ghost-engine.js)                             |
|    +-- DohResolver (src/network/doh-resolver.js)                            |
|    +-- EphemeralVault (src/storage/ephemeral-vault.js)                      |
|    +-- AdaptiveRuntime (src/meta/adaptive-runtime.js)                       |
|    +-- AegisAgent (src/agent/aegis-agent.js)                                |
|                                                                             |
|  [ Presentation Surface ]                                                   |
|    +-- BrowserWindow Chrome (src/ui/chrome/preload.js, index.html)          |
|    +-- WebContentsView Surface (src/ui/content/content-preload.js)          |
+-----------------------------------------------------------------------------+
```

## 2. Mathematical Formulations

### 2.1 Bloom-Trie Hashing Projection
The flat bitset filter projects an incoming domain string D into a 262,144-bit vector using three MurmurHash3 permutations with distinct coprime seeds:

$$h_1 = \text{Murmur3}(D, 0x9747b28c)$$
$$h_2 = \text{Murmur3}(D, 0xcafebabe)$$
$$h_3 = \text{Murmur3}(D, 0x1337c0de)$$

A candidate domain is immediately permitted if:

$$\left(\text{Bitset}[h_1 \bmod M] \land \text{Bitset}[h_2 \bmod M] \land \text{Bitset}[h_3 \bmod M]\right) = 0$$

### 2.2 Shannon Entropy Evaluation
EntropyShield calculates the information density of domain labels and query tokens:

$$H(X) = -\sum_{x \in X} P(x) \log_2 P(x)$$

Where:
- P(x) denotes the empirical probability of character occurrence within string X.
- Tokens exhibiting H >= 3.4 with concurrent alphanumeric dispersion are flagged as algorithmic tracking signatures.

## 3. Storage Enclave Isolation Model
The EphemeralVault provisions transient storage blocks encrypted via AES-256-GCM. The primary master key resides exclusively in memory and undergoes cryptographic erasure (`Buffer.fill(0)`) upon application termination.
