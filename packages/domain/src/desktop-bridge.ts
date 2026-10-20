import { z } from 'zod';
import type {
  NativeHubNetwork,
  NativeHubTrust,
  NativeHubRequest,
  NativeHubResponse,
  NativeHubDiscovery,
  NativeHubSocketOpen,
  NativeHubSocketSend,
  NativeHubNetworkChange,
} from './hub-native';
import { HUB_CONNECTION_METADATA, type HubConnectionMetadata } from './hub-connections';
import type { FirewallApplyResult } from './api/firewall';
import type { NativeHtmlPreview } from './native-html-preview';
import type { DesktopBrowser } from './desktop-browser';
import type { MachineUpdateStatus } from './machine-updates';
import type { OverlayAction, OverlayHostView } from './voice-overlay';
export const DESKTOP_COMPUTER_IDENTITY = z.object({
  device_id: z.uuid().nullable(),
  machine_id: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .nullable(),
});
export type DesktopComputerIdentity = z.infer<typeof DESKTOP_COMPUTER_IDENTITY>;
export type DesktopPlatform = 'linux' | 'darwin' | 'win32';

interface DesktopNotification {
  readonly title: string;
  readonly body: string;
}

export interface DesktopServer {
  readonly connection?: HubConnectionMetadata;
  readonly url: string;
  readonly token: string;
}
export const DESKTOP_SERVER: z.ZodType<DesktopServer> = z.object({
  url: z.string(),
  token: z.string(),
  connection: z.exactOptional(HUB_CONNECTION_METADATA),
});

export type DesktopServiceManager = 'systemd' | 'launchd' | 'windows-run';

export type DesktopServiceHealth = 'not-installed' | 'stopped' | 'starting' | 'running' | 'failed';

export type DesktopLinger = 'enabled' | 'disabled' | 'unsupported';

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
  | { readonly kind: 'open' }
  | { readonly kind: 'assistant'; readonly phase: 'press' | 'release' | 'toggle' }
  | { readonly kind: 'assistant_mute' };

export type DesktopTalkBackend = 'portal' | 'electron';

export interface DesktopTalkShortcuts {
  readonly backend: DesktopTalkBackend;
  readonly hold: boolean;
  readonly talk: string | null;
  readonly next: string | null;
  readonly assistant: string | null;
  readonly assistantMute: string | null;
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

export type DesktopCaptureMode = 'picker' | 'portal';

export type DesktopCaptureKind = 'screen' | 'window';

export interface DesktopCaptureSource {
  readonly id: string;
  readonly kind: DesktopCaptureKind;
  readonly title: string;
  readonly thumbnail: string | null;
  readonly appIcon: string | null;
  readonly primary: boolean;
  readonly width: number | null;
  readonly height: number | null;
}

export interface DesktopStill {
  readonly sourceId: string;
  readonly kind: DesktopCaptureKind;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly mime: 'image/jpeg';
  readonly dataBase64: string;
}

export const OVERLAY_LEVELS_PORT_MESSAGE = 'smarteverything:overlay-levels';

export type DesktopOverlayHelper =
  | { readonly kind: 'unused' | 'ready' | 'absent' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface SmartEverythingDesktop {
  readonly browser?: DesktopBrowser;
  readonly htmlPreview?: NativeHtmlPreview;
  readonly hubNetwork?: NativeHubNetwork;
  computerIdentity?(): Promise<DesktopComputerIdentity>;
  readonly platform: DesktopPlatform;
  readonly version: string;
  notify(notification: DesktopNotification): Promise<void>;
  getStartOnLogin(): Promise<boolean>;
  setStartOnLogin(enabled: boolean): Promise<boolean>;
  onDeepLink(listener: (url: string) => void): () => void;
  takePendingDeepLinks(): Promise<readonly string[]>;
  server(): Promise<DesktopServer | null>;
  setWindow(window: DesktopServer | null): Promise<void>;
  serviceStatus(): Promise<DesktopServiceStatus>;
  startService(): Promise<DesktopServiceStatus>;
  stopService(): Promise<DesktopServiceStatus>;
  restartService(): Promise<DesktopServiceStatus>;
  uninstallService(): Promise<DesktopServiceStatus>;
  enableServiceLinger(): Promise<DesktopServiceStatus>;
  serviceLogs(): Promise<DesktopServiceLogs>;
  onServiceStatus(listener: (status: DesktopServiceStatus) => void): () => void;
  applyFirewall(revision: string): Promise<FirewallApplyResult>;
  onTalkCommand?(listener: (command: DesktopTalkCommand) => void): () => void;
  talkShortcuts?(): Promise<DesktopTalkShortcuts>;
  configureTalkShortcuts?(): Promise<DesktopTalkShortcuts>;
  setTalkTray?(tray: DesktopTalkTray): Promise<void>;
  attention?(): Promise<void>;
  setOverlay?(view: OverlayHostView): Promise<void>;
  onOverlayAction?(listener: (action: OverlayAction) => void): () => void;
  onOverlayHold?(listener: (active: boolean) => void): () => void;
  overlayHelper?(): Promise<DesktopOverlayHelper>;
  onOverlayHelper?(listener: (helper: DesktopOverlayHelper) => void): () => void;
  captureMode?(): Promise<DesktopCaptureMode>;
  listCaptureSources?(): Promise<readonly DesktopCaptureSource[]>;
  chooseCaptureSource?(sourceId: string | null): Promise<void>;
  captureStill?(sourceId: string | null): Promise<DesktopStill>;
  updateStatus?(): Promise<MachineUpdateStatus>;
  checkForUpdate?(): Promise<MachineUpdateStatus>;
  installUpdate?(): Promise<MachineUpdateStatus>;
  onUpdateStatus?(listener: (status: MachineUpdateStatus) => void): () => void;
}

export interface DesktopInvokeChannels {
  readonly 'desktop:hub-configure-trust': {
    readonly request: NativeHubTrust;
    readonly response: undefined;
  };
  readonly 'desktop:hub-clear-trust': { readonly request: string; readonly response: undefined };
  readonly 'desktop:hub-request': {
    readonly request: NativeHubRequest;
    readonly response: NativeHubResponse;
  };
  readonly 'desktop:hub-discovery-start': {
    readonly request: undefined;
    readonly response: NativeHubDiscovery;
  };
  readonly 'desktop:hub-discovery-stop': {
    readonly request: undefined;
    readonly response: undefined;
  };
  readonly 'desktop:hub-network-start': {
    readonly request: undefined;
    readonly response: NativeHubNetworkChange;
  };
  readonly 'desktop:hub-network-stop': {
    readonly request: undefined;
    readonly response: undefined;
  };
  readonly 'desktop:hub-socket-open': {
    readonly request: NativeHubSocketOpen;
    readonly response: undefined;
  };
  readonly 'desktop:hub-socket-send': {
    readonly request: NativeHubSocketSend;
    readonly response: undefined;
  };
  readonly 'desktop:hub-socket-close': { readonly request: string; readonly response: undefined };
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
  readonly 'desktop:computer-identity': {
    readonly request: undefined;
    readonly response: DesktopComputerIdentity;
  };
  readonly 'desktop:server': {
    readonly request: undefined;
    readonly response: DesktopServer | null;
  };
  readonly 'desktop:set-window': {
    readonly request: DesktopServer | null;
    readonly response: undefined;
  };
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
  readonly 'desktop:talk-shortcuts': {
    readonly request: undefined;
    readonly response: DesktopTalkShortcuts;
  };
  readonly 'desktop:talk-configure': {
    readonly request: undefined;
    readonly response: DesktopTalkShortcuts;
  };
  readonly 'desktop:talk-tray': { readonly request: DesktopTalkTray; readonly response: undefined };
  readonly 'desktop:overlay-view': {
    readonly request: OverlayHostView;
    readonly response: undefined;
  };
  readonly 'desktop:overlay-helper': {
    readonly request: undefined;
    readonly response: DesktopOverlayHelper;
  };
  readonly 'desktop:attention': { readonly request: undefined; readonly response: undefined };
  readonly 'desktop:capture-mode': {
    readonly request: undefined;
    readonly response: DesktopCaptureMode;
  };
  readonly 'desktop:capture-sources': {
    readonly request: undefined;
    readonly response: readonly DesktopCaptureSource[];
  };
  readonly 'desktop:capture-choose': {
    readonly request: string | null;
    readonly response: undefined;
  };
  readonly 'desktop:capture-still': {
    readonly request: string | null;
    readonly response: DesktopStill;
  };
  readonly 'desktop:firewall-apply': {
    readonly request: string;
    readonly response: FirewallApplyResult;
  };
  readonly 'desktop:update-status': UpdateCall;
  readonly 'desktop:update-check': UpdateCall;
  readonly 'desktop:update-install': UpdateCall;
}

interface UpdateCall {
  readonly request: undefined;
  readonly response: MachineUpdateStatus;
}

interface ServiceCall {
  readonly request: undefined;
  readonly response: DesktopServiceStatus;
}

export type DesktopInvokeChannel = keyof DesktopInvokeChannels;

export type DesktopEventChannel =
  | 'desktop:deep-link'
  | 'desktop:service-status-changed'
  | 'desktop:update-status-changed'
  | 'desktop:talk-command'
  | 'desktop:overlay-action'
  | 'desktop:overlay-hold'
  | 'desktop:overlay-helper'
  | 'desktop:hub-discovery'
  | 'desktop:hub-socket'
  | 'desktop:hub-network';

export type DesktopPortChannel = 'desktop:overlay-levels';

export type DesktopGlobalName = 'smartEverythingDesktop';

export type DesktopVersionArgumentPrefix = '--smarteverything-version=';
