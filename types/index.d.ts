/**
 * Aegis Platform TypeScript Definitions
 * Master Release v1.0.0
 */

export interface NavState {
  loading: boolean;
  url: string;
  canGoBack: boolean;
  canGoFwd: boolean;
  title?: string;
}

export interface NexusTelemetry {
  blockedCount: number;
  entropyThreats: number;
  recentBlockedReason?: string;
  adaptiveMode: 'HYPER_DRIVE' | 'ADAPTIVE_BALANCED' | 'CONSERVATIVE';
}

export interface GhostPersona {
  id: string;
  renderer: string;
  vendor: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
    dpr: number;
  };
  canvasSeed: number;
  audioOffset: number;
}

export interface EntropyVerdict {
  suspicious: boolean;
  score: number;
  reason: string | null;
}

export interface ShieldVerdict {
  action: 'ALLOW' | 'BLOCK';
  reason?: string;
  entropy?: number;
  fallback?: boolean;
}

export interface ElectronBrowserAPI {
  navigate(url: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  minimize(): void;
  maximize(): void;
  close(): void;
  onNavState(cb: (state: NavState) => void): void;
  onNexusTelemetry(cb: (telemetry: NexusTelemetry) => void): void;
  onBlockedCount(cb: (count: number) => void): void;
}

declare global {
  interface Window {
    api: ElectronBrowserAPI;
  }
}
