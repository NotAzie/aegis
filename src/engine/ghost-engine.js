/**
 * GhostEngine — Cryptographically Coherent Synthetic Cohort Simulator
 *
 * Eliminates the "Fingerprinting Paradox". Instead of injecting random noise
 * that fails statistical anomaly checks, GhostEngine assigns each origin
 * a deterministic, mathematically authentic hardware persona chosen from
 * verified real-world hardware distributions.
 */

const GOLDEN_COHORTS = [
  {
    id: 'Apple_M3_Metal',
    renderer: 'Apple M3 Max',
    vendor: 'Apple Inc.',
    platform: 'MacIntel',
    hardwareConcurrency: 14,
    deviceMemory: 36,
    screen: { width: 1728, height: 1117, availWidth: 1728, availHeight: 1092, colorDepth: 30, pixelDepth: 30, dpr: 2 },
    canvasSeed: 0x4a8f1b,
    audioOffset: 0.000012
  },
  {
    id: 'Dell_XPS15_RTX4070',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)',
    vendor: 'Google Inc. (NVIDIA)',
    platform: 'Win32',
    hardwareConcurrency: 16,
    deviceMemory: 32,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, dpr: 1.25 },
    canvasSeed: 0x9b2e7c,
    audioOffset: -0.000018
  },
  {
    id: 'ThinkPad_T14_IrisXe',
    renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    vendor: 'Google Inc. (Intel)',
    platform: 'Win32',
    hardwareConcurrency: 8,
    deviceMemory: 16,
    screen: { width: 1920, height: 1200, availWidth: 1920, availHeight: 1160, colorDepth: 24, pixelDepth: 24, dpr: 1.0 },
    canvasSeed: 0x12c4d8,
    audioOffset: 0.000008
  },
  {
    id: 'Framework_Linux_Radeon',
    renderer: 'AMD Radeon 780M (RADV GFX1103_R1)',
    vendor: 'Mesa',
    platform: 'Linux x86_64',
    hardwareConcurrency: 16,
    deviceMemory: 32,
    screen: { width: 2256, height: 1504, availWidth: 2256, availHeight: 1464, colorDepth: 24, pixelDepth: 24, dpr: 1.5 },
    canvasSeed: 0x5e91a0,
    audioOffset: -0.000006
  },
  {
    id: 'SurfacePro_SnapdragonX',
    renderer: 'Qualcomm(R) Adreno(TM) X1-85 GPU',
    vendor: 'Qualcomm',
    platform: 'Win32',
    hardwareConcurrency: 12,
    deviceMemory: 16,
    screen: { width: 2880, height: 1920, availWidth: 2880, availHeight: 1880, colorDepth: 24, pixelDepth: 24, dpr: 2 },
    canvasSeed: 0x77ab34,
    audioOffset: 0.000014
  }
];

function simpleHash(str, salt = 0x5bd1e995) {
  let h = salt ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 13;
  }
  return (h >>> 0);
}

class GhostEngine {
  constructor(sessionSalt = Math.floor(Math.random() * 0xffffff)) {
    this.sessionSalt = sessionSalt;
    this.cohorts = GOLDEN_COHORTS;
  }

  /**
   * Resolve synthetic persona for a given origin
   */
  resolvePersona(origin) {
    if (!origin) return this.cohorts[0];
    const cleanOrigin = origin.toLowerCase().trim();
    const hash = simpleHash(cleanOrigin, this.sessionSalt);
    const index = hash % this.cohorts.length;
    return this.cohorts[index];
  }
}

module.exports = { GhostEngine, GOLDEN_COHORTS };
