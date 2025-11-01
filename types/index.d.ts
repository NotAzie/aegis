/**
 * PrivacyBrowser Type Definitions
 */

export interface NavState {
  loading: boolean;
  url: string;
  canGoBack: boolean;
  canGoFwd: boolean;
  title?: string;
}

export interface ProxyConfig {
  type: 'socks5' | 'http';
  host: string;
  port: number;
}

export interface SecurityWarning {
  type: 'insecure-form' | 'mixed-content' | 'cert-error';
  url: string;
}

export interface ElectronBrowserAPI {
  navigate(url: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  minimize(): void;
  maximize(): void;
  close(): void;
  getUa(): void;
  setProxy(config: ProxyConfig | null): void;
  onNavState(cb: (state: NavState) => void): void;
  onBlockedCount(cb: (count: number) => void): void;
  onProxyState(cb: (state: { active: boolean; rules?: string }) => void): void;
  onSecurityWarning(cb: (warning: SecurityWarning) => void): void;
  onCertificateError(cb: (err: any) => void): void;
  onWebrtcMode(cb: (mode: string) => void): void;
  onUaInfo(cb: (ua: string) => void): void;
}

declare global {
  interface Window {
    api: ElectronBrowserAPI;
  }
}
