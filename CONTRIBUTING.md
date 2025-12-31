# Contribution Guidelines: Aegis Platform

## 1. Development Principles

Aegis is engineered for extreme algorithmic efficiency, zero-knowledge security, and mathematical rigor. All contributions must adhere to the following standards:

1. **Theoretical Latency Bounds**: Core routing and filtering logic must execute within bounded algorithmic complexities. Linear scans ($O(N)$) on hot request paths are rejected; constant-time ($O(1)$) or bounded logarithmic ($O(\log N)$) solutions are required.
2. **Deterministic Behavior**: Code paths must produce reproducible, deterministic results across all supported execution targets (Linux, macOS, Windows).
3. **Clinical Documentation Standard**: Code comments, documentation files, commit messages, and test outputs must maintain a strictly technical, professional tone with zero emojis or marketing jargon.

---

## 2. Engineering Workflow

### 2.1 Branching Strategy
- Develop all features and bug fixes on isolated topic branches branched from `main`.
- Naming convention: `<type>/<subsystem>-<description>` (e.g., `feat/doh-edns-padding`, `perf/bloom-bitset-simd`).

### 2.2 Commit Message Convention
All commits must follow Conventional Commits formatting:
```
<type>(<scope>): <clinical concise description>
```
Supported types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`.

---

## 3. Verification & Performance Gates

Before submitting a Pull Request, verify that all automated regression suites and micro-benchmarks satisfy quality gates:

```bash
# Execute unit and subsystem integration tests
npm test

# Execute micro-benchmark suite
npm run bench
```

### 3.1 Latency Acceptance Criteria
- `AegisHyperTrie`: Domain matching latency must remain $\le 300\text{ nanoseconds}$ per query.
- `EntropyShield`: Shannon evaluation latency must remain $\le 4.0\text{ microseconds}$ per URL.
- `AdaptiveRuntime`: Telemetry monitor overhead must remain $\le 0.10\text{ microseconds}$ per call.

Submissions causing latency regressions exceeding 5% without theoretical justification will be rejected during automated triage.

---

## 4. Pull Request Review Criteria

Pull requests are evaluated against:
1. Architectural decoupling and boundary compliance (`src/core`, `src/engine`, `src/network`, `src/storage`).
2. Memory footprint verification (zero-disk leakage, explicit garbage collection, absence of circular references).
3. Complete TypeScript type annotations (`types/index.d.ts`).
4. 100% test pass rate across matrix platforms.
