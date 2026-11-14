import { z } from 'zod';
import type {
  DesktopGoogleAnswer,
  DesktopGoogleAuthorize,
  DesktopGoogleLink,
  DesktopGoogleOpened,
} from './desktop-google';
import type {
  DesktopPhotos,
  DesktopPhotoLibrary,
  DESKTOP_PHOTO_HASH,
  DESKTOP_PHOTO_HASH_REQUEST,
} from './desktop-photos';
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
import type { NativeHtmlPreview } from './chat-pages';
import type { ComputerNodePairing } from './computer-nodes';
import type { DesktopBrowser } from './desktop-browser';
import type { AppUpdateChannel } from './app-updates';
import type { MachineUpdateStatus } from './machine-updates';
import type { WebUpdateApplyTarget, WebUpdateStatus } from './web-updates';
import type { OverlayAction, OverlayHostView } from './voice-overlay';
import type { DesktopDrive, DesktopDriveCommand, DesktopDriveState } from './desktop-drive';
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

export interface DesktopClipboard {
  readText(): Promise<string | null>;
  writeText(text: string): Promise<void>;
  onChange(listener: (text: string) => void): () => void;
}

export const OVERLAY_LEVELS_PORT_MESSAGE = 'smarteverything:overlay-levels';

export const DESKTOP_CLIPBOARD_CHANGED = 'desktop:clipboard-changed';

export type DesktopOverlayHelper =
  | { readonly kind: 'unused' | 'ready' | 'absent' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface SmartEverythingDesktop {
  readonly photos?: DesktopPhotos;
  readonly googleLink?: DesktopGoogleLink;
  readonly browser?: DesktopBrowser;
  readonly clipboard?: DesktopClipboard;
  readonly htmlPreview?: NativeHtmlPreview;
  readonly hubNetwork?: NativeHubNetwork;
  readonly drive?: DesktopDrive;
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
  pairComputer?(pairing: ComputerNodePairing): Promise<void>;
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
  updateStatus(): Promise<MachineUpdateStatus>;
  checkForUpdate(): Promise<MachineUpdateStatus>;
  installUpdate(expectedOfferId: string): Promise<MachineUpdateStatus>;
  onUpdateStatus(listener: (status: MachineUpdateStatus) => void): () => void;
  webUpdateStatus(): Promise<WebUpdateStatus>;
  checkWebUpdate(channel: AppUpdateChannel): Promise<WebUpdateStatus>;
  downloadWebUpdate(expectedId: string): Promise<WebUpdateStatus>;
  applyWebUpdate(target: WebUpdateApplyTarget): Promise<WebUpdateStatus>;
  onWebUpdateStatus(listener: (status: WebUpdateStatus) => void): () => void;
  onWebUpdateConfirmRequested(listener: () => void): () => void;
  confirmWebBundle(): Promise<void>;
  reportWebBundleFailure(reason: string): Promise<void>;
}

export interface DesktopInvokeChannels {
  readonly 'desktop:photos-list': {
    readonly request: undefined;
    readonly response: DesktopPhotoLibrary;
  };
  readonly 'desktop:photos-hash': {
    readonly request: z.infer<typeof DESKTOP_PHOTO_HASH_REQUEST>;
    readonly response: z.infer<typeof DESKTOP_PHOTO_HASH>;
  };
  readonly 'desktop:google-link-open': {
    readonly request: undefined;
    readonly response: DesktopGoogleOpened;
  };
  readonly 'desktop:google-link-authorize': {
    readonly request: DesktopGoogleAuthorize;
    readonly response: DesktopGoogleAnswer;
  };
  readonly 'desktop:google-link-cancel': {
    readonly request: undefined;
    readonly response: undefined;
  };
  readonly 'desktop:photos-cancel': { readonly request: string; readonly response: undefined };
  readonly 'desktop:photos-charging': { readonly request: undefined; readonly response: boolean };
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
  readonly 'desktop:computer-pair': {
    readonly request: ComputerNodePairing;
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
  readonly 'desktop:update-install': {
    readonly request: string;
    readonly response: MachineUpdateStatus;
  };
  readonly 'desktop:web-update-status': {
    readonly request: undefined;
    readonly response: WebUpdateStatus;
  };
  readonly 'desktop:web-update-check': {
    readonly request: AppUpdateChannel;
    readonly response: WebUpdateStatus;
  };
  readonly 'desktop:web-update-download': {
    readonly request: string;
    readonly response: WebUpdateStatus;
  };
  readonly 'desktop:web-update-apply': {
    readonly request: WebUpdateApplyTarget;
    readonly response: WebUpdateStatus;
  };
  readonly 'desktop:web-update-confirm': {
    readonly request: undefined;
    readonly response: undefined;
  };
  readonly 'desktop:web-update-report-failure': {
    readonly request: string;
    readonly response: undefined;
  };
  readonly 'desktop:drive-state': {
    readonly request: undefined;
    readonly response: DesktopDriveState | null;
  };
  readonly 'desktop:drive-run': {
    readonly request: DesktopDriveCommand;
    readonly response: DesktopDriveState;
  };
  readonly 'desktop:clipboard-read': {
    readonly request: undefined;
    readonly response: string | null;
  };
  readonly 'desktop:clipboard-write': {
    readonly request: string;
    readonly response: undefined;
  };
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
  | 'desktop:web-update-status-changed'
  | 'desktop:web-update-confirm-requested'
  | 'desktop:talk-command'
  | 'desktop:overlay-action'
  | 'desktop:overlay-hold'
  | 'desktop:overlay-helper'
  | 'desktop:hub-discovery'
  | 'desktop:hub-socket'
  | 'desktop:hub-network'
  | 'desktop:drive-changed';

export type DesktopPortChannel = 'desktop:overlay-levels';

export type DesktopGlobalName = 'smartEverythingDesktop';

export type DesktopVersionArgumentPrefix = '--smarteverything-version=';
