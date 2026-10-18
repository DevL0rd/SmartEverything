import electron from 'electron';
import { z } from 'zod';
import {
  BROWSER_STATUS,
  BROWSER_WINDOW_REQUEST,
  MACHINE_UPDATE_STATUS,
  OVERLAY_ACTION,
} from '@smarteverything/domain';
import { htmlPreview } from './html-preview/preload';
import * as hubPreload from './hub-network/preload';
import { browserDiagnostics } from './browser-diagnostics-preload';
import { relayOverlayLevels, type MessageTarget } from './overlay/levels-relay';
import { OVERLAY_LEVELS_PORT_CHANNEL } from './overlay/overlay-messages';
import type {
  DesktopBrowser,
  DesktopCaptureSource,
  DesktopFirewallResult,
  DesktopGlobalName,
  DesktopInvokeChannel,
  DesktopInvokeChannels,
  DesktopOverlayHelper,
  DesktopPlatform,
  DesktopServiceLogs,
  DesktopServiceStatus,
  DesktopStill,
  DesktopTalkCommand,
  DesktopTalkShortcuts,
  DesktopTalkTray,
  DesktopVersionArgumentPrefix,
  MachineUpdateStatus,
  SmartEverythingDesktop,
} from '@smarteverything/domain';

const GLOBAL_NAME: DesktopGlobalName = 'smartEverythingDesktop';
const VERSION_PREFIX: DesktopVersionArgumentPrefix = '--smarteverything-version=';

const SERVICE_STATUS: z.ZodType<DesktopServiceStatus> = z.object({
  manager: z.enum(['systemd', 'launchd', 'windows-run']),
  health: z.enum(['not-installed', 'stopped', 'starting', 'running', 'failed']),
  installed: z.boolean(),
  active: z.boolean(),
  url: z.string().nullable(),
  dataDirectory: z.string(),
  detail: z.string(),
  linger: z.enum(['enabled', 'disabled', 'unsupported']),
  managedBy: z.exactOptional(z.literal('stable-app')),
});
const SERVICE_LOGS: z.ZodType<DesktopServiceLogs> = z.object({
  file: z.string(),
  lines: z.array(z.string()),
});
const FIREWALL_RESULT: z.ZodType<DesktopFirewallResult> = z.object({
  outcome: z.enum(['applied', 'declined', 'failed', 'stale']),
  detail: z.string(),
});
const TALK_COMMAND: z.ZodType<DesktopTalkCommand> = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['press', 'release', 'toggle', 'next', 'open']) }),
  z.object({ kind: z.literal('select'), channelId: z.string() }),
  z.object({ kind: z.literal('assistant'), phase: z.enum(['press', 'release', 'toggle']) }),
  z.object({ kind: z.literal('assistant_mute') }),
]);
const TALK_SHORTCUTS: z.ZodType<DesktopTalkShortcuts> = z.object({
  backend: z.enum(['portal', 'electron']),
  hold: z.boolean(),
  talk: z.string().nullable(),
  next: z.string().nullable(),
  assistant: z.string().nullable(),
  assistantMute: z.string().nullable(),
  problem: z.string().nullable(),
});
const OVERLAY_HELPER: z.ZodType<DesktopOverlayHelper> = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['unused', 'ready', 'absent']) }),
  z.object({ kind: z.literal('failed'), reason: z.string() }),
]);
const CAPTURE_KIND = z.enum(['screen', 'window']);
const CAPTURE_SOURCE: z.ZodType<DesktopCaptureSource> = z.object({
  id: z.string(),
  kind: CAPTURE_KIND,
  title: z.string(),
  thumbnail: z.string().nullable(),
  appIcon: z.string().nullable(),
  primary: z.boolean(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});
const STILL: z.ZodType<DesktopStill> = z.object({
  sourceId: z.string(),
  kind: CAPTURE_KIND,
  title: z.string(),
  width: z.number(),
  height: z.number(),
  mime: z.literal('image/jpeg'),
  dataBase64: z.string(),
});

function platformOfProcess(): DesktopPlatform {
  const platform = process.platform;
  if (platform === 'linux' || platform === 'darwin' || platform === 'win32') {
    return platform;
  }
  throw new Error(`the desktop shell runs on linux, darwin or win32; received ${platform}`);
}

function versionOfProcess(): string {
  const argument = process.argv.find((candidate) => candidate.startsWith(VERSION_PREFIX));
  if (argument === undefined) {
    throw new Error(`the main process passes ${VERSION_PREFIX}<version>; received none`);
  }
  return argument.slice(VERSION_PREFIX.length);
}

async function invoke<C extends DesktopInvokeChannel>(
  channel: C,
  request: DesktopInvokeChannels[C]['request'],
): Promise<unknown> {
  return electron.ipcRenderer.invoke(channel, request);
}

function answerOf<T>(channel: string, schema: z.ZodType<T>, answer: unknown): T {
  const parsed = schema.safeParse(answer);
  if (!parsed.success) {
    throw new Error(`${channel} answered something unexpected: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

async function invokeFor<C extends DesktopInvokeChannel, T>(
  channel: C,
  schema: z.ZodType<T>,
  request: DesktopInvokeChannels[C]['request'],
): Promise<T> {
  return answerOf(channel, schema, await invoke(channel, request));
}

function listen(channel: string, receive: (value: unknown) => void): () => void {
  const forward = (_event: unknown, value: unknown): void => {
    receive(value);
  };
  electron.ipcRenderer.on(channel, forward);
  return () => {
    electron.ipcRenderer.removeListener(channel, forward);
  };
}

type ServiceStatusChannel =
  | 'desktop:service-status'
  | 'desktop:service-start'
  | 'desktop:service-stop'
  | 'desktop:service-restart'
  | 'desktop:service-uninstall'
  | 'desktop:service-enable-linger';

const invokeForStatus = (channel: ServiceStatusChannel): Promise<DesktopServiceStatus> =>
  invokeFor(channel, SERVICE_STATUS, undefined);

const talkShortcutsFrom = (
  channel: 'desktop:talk-shortcuts' | 'desktop:talk-configure',
): Promise<DesktopTalkShortcuts> => invokeFor(channel, TALK_SHORTCUTS, undefined);

const invokeForUpdate = (
  channel: 'desktop:update-status' | 'desktop:update-check' | 'desktop:update-install',
): Promise<MachineUpdateStatus> => invokeFor(channel, MACHINE_UPDATE_STATUS, undefined);

const invokeForBoolean = (
  channel: 'desktop:get-start-on-login' | 'desktop:set-start-on-login',
  request: boolean | undefined,
): Promise<boolean> => invokeFor(channel, z.boolean(), request);

const browser: DesktopBrowser = {
  diagnostics: browserDiagnostics,
  command: async (command) => {
    await electron.ipcRenderer.invoke('desktop:browser', command);
  },
  subscribe: (listener) =>
    listen('desktop:browser-status', (value) => {
      listener(answerOf('desktop:browser-status', BROWSER_STATUS, value));
    }),
  subscribeWindowRequests: (listener) =>
    listen('desktop:browser-window', (value) => {
      listener(answerOf('desktop:browser-window', BROWSER_WINDOW_REQUEST, value));
    }),
};

const desktop: SmartEverythingDesktop = {
  browser,
  computerIdentity: hubPreload.computerIdentity,
  htmlPreview,
  hubNetwork: hubPreload.hubNetwork,
  platform: platformOfProcess(),
  version: versionOfProcess(),
  notify: async (notification) => {
    await invoke('desktop:notify', { title: notification.title, body: notification.body });
  },
  getStartOnLogin: () => invokeForBoolean('desktop:get-start-on-login', undefined),
  setStartOnLogin: (enabled) => invokeForBoolean('desktop:set-start-on-login', enabled),
  onDeepLink: (listener) =>
    listen('desktop:deep-link', (url) => {
      const parsed = z.string().safeParse(url);
      if (parsed.success) listener(parsed.data);
    }),
  takePendingDeepLinks: () => invokeFor('desktop:take-deep-links', z.array(z.string()), undefined),
  server: hubPreload.server,
  setWindow: async (window) => {
    await invoke('desktop:set-window', window);
  },
  serviceStatus: () => invokeForStatus('desktop:service-status'),
  startService: () => invokeForStatus('desktop:service-start'),
  stopService: () => invokeForStatus('desktop:service-stop'),
  restartService: () => invokeForStatus('desktop:service-restart'),
  uninstallService: () => invokeForStatus('desktop:service-uninstall'),
  enableServiceLinger: () => invokeForStatus('desktop:service-enable-linger'),
  serviceLogs: () => invokeFor('desktop:service-logs', SERVICE_LOGS, undefined),
  onServiceStatus: (listener) =>
    listen('desktop:service-status-changed', (status) => {
      listener(answerOf('desktop:service-status-changed', SERVICE_STATUS, status));
    }),
  applyFirewall: (revision) => invokeFor('desktop:firewall-apply', FIREWALL_RESULT, revision),
  onTalkCommand: (listener) =>
    listen('desktop:talk-command', (value) => {
      const command = TALK_COMMAND.safeParse(value);
      if (command.success) listener(command.data);
    }),
  talkShortcuts: () => talkShortcutsFrom('desktop:talk-shortcuts'),
  configureTalkShortcuts: () => talkShortcutsFrom('desktop:talk-configure'),
  setTalkTray: async (tray: DesktopTalkTray) => {
    await invoke('desktop:talk-tray', tray);
  },
  attention: async () => {
    await invoke('desktop:attention', undefined);
  },
  setOverlay: async (view) => {
    await invoke('desktop:overlay-view', view);
  },
  onOverlayAction: (listener) =>
    listen('desktop:overlay-action', (value) => {
      const action = OVERLAY_ACTION.safeParse(value);
      if (action.success) listener(action.data);
    }),
  onOverlayHold: (listener) =>
    listen('desktop:overlay-hold', (value) => {
      const active = z.boolean().safeParse(value);
      if (active.success) listener(active.data);
    }),
  overlayHelper: () => invokeFor('desktop:overlay-helper', OVERLAY_HELPER, undefined),
  onOverlayHelper: (listener) =>
    listen('desktop:overlay-helper', (value) => {
      listener(answerOf('desktop:overlay-helper', OVERLAY_HELPER, value));
    }),
  captureMode: () => invokeFor('desktop:capture-mode', z.enum(['picker', 'portal']), undefined),
  listCaptureSources: () =>
    invokeFor('desktop:capture-sources', z.array(CAPTURE_SOURCE), undefined),
  chooseCaptureSource: async (sourceId) => {
    await invoke('desktop:capture-choose', sourceId);
  },
  captureStill: (sourceId) => invokeFor('desktop:capture-still', STILL, sourceId),
  updateStatus: () => invokeForUpdate('desktop:update-status'),
  checkForUpdate: () => invokeForUpdate('desktop:update-check'),
  installUpdate: () => invokeForUpdate('desktop:update-install'),
  onUpdateStatus: (listener) =>
    listen('desktop:update-status-changed', (status) => {
      listener(answerOf('desktop:update-status-changed', MACHINE_UPDATE_STATUS, status));
    }),
};

declare const window: MessageTarget;

relayOverlayLevels(window, window, (port) => {
  electron.ipcRenderer.postMessage(OVERLAY_LEVELS_PORT_CHANNEL, null, [port]);
});

electron.contextBridge.exposeInMainWorld(GLOBAL_NAME, desktop);
