export type DesktopPlatform = 'linux' | 'darwin' | 'win32';

interface DesktopNotification {
  readonly title: string;
  readonly body: string;
}

export interface DesktopServer {
  readonly url: string;
  readonly token: string;
}

export type DesktopServiceManager = 'systemd' | 'launchd' | 'windows-run';

export type DesktopServiceHealth = 'not-installed' | 'stopped' | 'starting' | 'running' | 'failed';

export type DesktopLinger = 'enabled' | 'disabled' | 'before-login' | 'unsupported';

export interface DesktopServiceStatus {
  readonly manager: DesktopServiceManager;
  readonly health: DesktopServiceHealth;
  readonly installed: boolean;
  readonly active: boolean;
  readonly url: string | null;
  readonly dataDirectory: string;
  readonly detail: string;
  readonly linger: DesktopLinger;
  readonly managedBy?: 'stable-app';
}

export interface DesktopFfmpeg {
  readonly found: boolean;
  readonly path: string | null;
  readonly instructions: string;
}

export type DesktopFirewallOutcome = 'applied' | 'declined' | 'failed' | 'stale';

export interface DesktopFirewallResult {
  readonly outcome: DesktopFirewallOutcome;
  readonly detail: string;
}

export interface DesktopServiceLogs {
  readonly file: string;
  readonly lines: readonly string[];
}

export type DesktopTalkCommand =
  | { readonly kind: 'press' }
  | { readonly kind: 'release' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'next' }
  | { readonly kind: 'select'; readonly channelId: string }
  | { readonly kind: 'open' };

export type DesktopTalkBackend = 'portal' | 'electron';

export interface DesktopTalkShortcuts {
  readonly backend: DesktopTalkBackend;
  readonly hold: boolean;
  readonly talk: string | null;
  readonly next: string | null;
  readonly problem: string | null;
}

export interface DesktopTalkChannel {
  readonly id: string;
  readonly name: string;
}

export interface DesktopTalkTray {
  readonly status: string;
  readonly activity: 'idle' | 'talking' | 'receiving';
  readonly channels: readonly DesktopTalkChannel[];
  readonly talkChannel: string | null;
}

export interface SmartEverythingDesktop {
  readonly platform: DesktopPlatform;
  readonly version: string;
  notify(notification: DesktopNotification): Promise<void>;
  getStartOnLogin(): Promise<boolean>;
  setStartOnLogin(enabled: boolean): Promise<boolean>;
  onDeepLink(listener: (url: string) => void): () => void;
  takePendingDeepLinks(): Promise<readonly string[]>;
  server(): Promise<DesktopServer>;
  serviceStatus(): Promise<DesktopServiceStatus>;
  startService(): Promise<DesktopServiceStatus>;
  stopService(): Promise<DesktopServiceStatus>;
  restartService(): Promise<DesktopServiceStatus>;
  uninstallService(): Promise<DesktopServiceStatus>;
  enableServiceLinger(): Promise<DesktopServiceStatus>;
  serviceLogs(): Promise<DesktopServiceLogs>;
  onServiceStatus(listener: (status: DesktopServiceStatus) => void): () => void;
  checkFfmpeg(): Promise<DesktopFfmpeg>;
  applyFirewall(revision: string): Promise<DesktopFirewallResult>;
  onTalkCommand?(listener: (command: DesktopTalkCommand) => void): () => void;
  talkShortcuts?(): Promise<DesktopTalkShortcuts>;
  configureTalkShortcuts?(): Promise<DesktopTalkShortcuts>;
  setTalkTray?(tray: DesktopTalkTray): Promise<void>;
  attention?(): Promise<void>;
}

export interface DesktopInvokeChannels {
  readonly 'desktop:notify': {
    readonly request: DesktopNotification;
    readonly response: undefined;
  };
  readonly 'desktop:get-start-on-login': {
    readonly request: undefined;
    readonly response: boolean;
  };
  readonly 'desktop:set-start-on-login': { readonly request: boolean; readonly response: boolean };
  readonly 'desktop:take-deep-links': {
    readonly request: undefined;
    readonly response: readonly string[];
  };
  readonly 'desktop:server': { readonly request: undefined; readonly response: DesktopServer };
  readonly 'desktop:service-status': ServiceCall;
  readonly 'desktop:service-start': ServiceCall;
  readonly 'desktop:service-stop': ServiceCall;
  readonly 'desktop:service-restart': ServiceCall;
  readonly 'desktop:service-uninstall': ServiceCall;
  readonly 'desktop:service-enable-linger': ServiceCall;
  readonly 'desktop:service-logs': {
    readonly request: undefined;
    readonly response: DesktopServiceLogs;
  };
  readonly 'desktop:ffmpeg': { readonly request: undefined; readonly response: DesktopFfmpeg };
  readonly 'desktop:talk-shortcuts': {
    readonly request: undefined;
    readonly response: DesktopTalkShortcuts;
  };
  readonly 'desktop:talk-configure': {
    readonly request: undefined;
    readonly response: DesktopTalkShortcuts;
  };
  readonly 'desktop:talk-tray': { readonly request: DesktopTalkTray; readonly response: undefined };
  readonly 'desktop:attention': { readonly request: undefined; readonly response: undefined };
  readonly 'desktop:firewall-apply': {
    readonly request: string;
    readonly response: DesktopFirewallResult;
  };
}

interface ServiceCall {
  readonly request: undefined;
  readonly response: DesktopServiceStatus;
}

export type DesktopInvokeChannel = keyof DesktopInvokeChannels;

export type DesktopEventChannel =
  'desktop:deep-link' | 'desktop:service-status-changed' | 'desktop:talk-command';

export type DesktopGlobalName = 'smartEverythingDesktop';

export type DesktopVersionArgumentPrefix = '--smarteverything-version=';
