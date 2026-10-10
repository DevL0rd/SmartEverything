import electron = require('electron');
import type {
  DesktopEventChannel,
  DesktopFfmpeg,
  DesktopFirewallOutcome,
  DesktopFirewallResult,
  DesktopGlobalName,
  DesktopInvokeChannel,
  DesktopInvokeChannels,
  DesktopLinger,
  DesktopPlatform,
  DesktopServer,
  DesktopServiceHealth,
  DesktopServiceLogs,
  DesktopServiceManager,
  DesktopServiceStatus,
  DesktopTalkCommand,
  DesktopTalkShortcuts,
  DesktopTalkTray,
  DesktopVersionArgumentPrefix,
  SmartEverythingDesktop,
} from '@smarteverything/domain';

const GLOBAL_NAME: DesktopGlobalName = 'smartEverythingDesktop';
const VERSION_PREFIX: DesktopVersionArgumentPrefix = '--smarteverything-version=';
const DEEP_LINK_CHANNEL: DesktopEventChannel = 'desktop:deep-link';
const SERVICE_STATUS_CHANNEL: DesktopEventChannel = 'desktop:service-status-changed';
const TALK_COMMAND_CHANNEL: DesktopEventChannel = 'desktop:talk-command';

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

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

async function invoke<C extends DesktopInvokeChannel>(
  channel: C,
  request: DesktopInvokeChannels[C]['request'],
): Promise<unknown> {
  return electron.ipcRenderer.invoke(channel, request);
}

async function invokeForBoolean(
  channel: 'desktop:get-start-on-login' | 'desktop:set-start-on-login',
  request: boolean | undefined,
): Promise<boolean> {
  const answer = await invoke(channel, request);
  if (!isBoolean(answer)) {
    throw new Error(`${channel} answers a boolean; received ${typeof answer}`);
  }
  return answer;
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

async function takeDeepLinks(): Promise<readonly string[]> {
  const answer: unknown = await invoke('desktop:take-deep-links', undefined);
  if (!isList(answer) || !answer.every(isString)) {
    throw new Error('desktop:take-deep-links answers a list of links; received something else');
  }
  return answer.filter(isString);
}

function onDeepLink(listener: (url: string) => void): () => void {
  const forward = (_event: unknown, url: unknown): void => {
    if (isString(url)) {
      listener(url);
    }
  };
  electron.ipcRenderer.on(DEEP_LINK_CHANNEL, forward);
  return () => {
    electron.ipcRenderer.removeListener(DEEP_LINK_CHANNEL, forward);
  };
}

class BridgeAnswerError extends Error {
  constructor(channel: string, expected: string) {
    super(`${channel} answers ${expected}; received something else`);
    this.name = 'BridgeAnswerError';
  }
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldsOf(channel: string, expected: string, value: unknown): Fields {
  if (!isFields(value)) {
    throw new BridgeAnswerError(channel, expected);
  }
  return value;
}

function oneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return options.some((option) => option === value);
}

function stringOf(channel: string, fields: Fields, key: string): string {
  const value = fields[key];
  if (!isString(value)) {
    throw new BridgeAnswerError(channel, `a text ${key}`);
  }
  return value;
}

function nullableStringOf(channel: string, fields: Fields, key: string): string | null {
  return fields[key] === null ? null : stringOf(channel, fields, key);
}

function booleanOf(channel: string, fields: Fields, key: string): boolean {
  const value = fields[key];
  if (!isBoolean(value)) {
    throw new BridgeAnswerError(channel, `a boolean ${key}`);
  }
  return value;
}

function choiceOf<T extends string>(
  channel: string,
  fields: Fields,
  key: string,
  options: readonly T[],
): T {
  const value = fields[key];
  if (!oneOf(options, value)) {
    throw new BridgeAnswerError(channel, `${key} as one of ${options.join(', ')}`);
  }
  return value;
}

const MANAGERS: readonly DesktopServiceManager[] = ['systemd', 'launchd', 'windows-run'];
const HEALTHS: readonly DesktopServiceHealth[] = [
  'not-installed',
  'stopped',
  'starting',
  'running',
  'failed',
];
const LINGERS: readonly DesktopLinger[] = ['enabled', 'disabled', 'unsupported'];
const SERVICE_OWNERS: readonly NonNullable<DesktopServiceStatus['managedBy']>[] = ['stable-app'];

function parseServiceStatus(channel: string, value: unknown): DesktopServiceStatus {
  const fields = fieldsOf(channel, 'a service status', value);
  return {
    manager: choiceOf(channel, fields, 'manager', MANAGERS),
    health: choiceOf(channel, fields, 'health', HEALTHS),
    installed: booleanOf(channel, fields, 'installed'),
    active: booleanOf(channel, fields, 'active'),
    url: nullableStringOf(channel, fields, 'url'),
    dataDirectory: stringOf(channel, fields, 'dataDirectory'),
    detail: stringOf(channel, fields, 'detail'),
    linger: choiceOf(channel, fields, 'linger', LINGERS),
    ...(fields['managedBy'] === undefined
      ? {}
      : { managedBy: choiceOf(channel, fields, 'managedBy', SERVICE_OWNERS) }),
  };
}

type ServiceStatusChannel =
  | 'desktop:service-status'
  | 'desktop:service-start'
  | 'desktop:service-stop'
  | 'desktop:service-restart'
  | 'desktop:service-uninstall'
  | 'desktop:service-enable-linger';

async function invokeForStatus(channel: ServiceStatusChannel): Promise<DesktopServiceStatus> {
  return parseServiceStatus(channel, await invoke(channel, undefined));
}

function onServiceStatus(listener: (status: DesktopServiceStatus) => void): () => void {
  const forward = (_event: unknown, status: unknown): void => {
    listener(parseServiceStatus(SERVICE_STATUS_CHANNEL, status));
  };
  electron.ipcRenderer.on(SERVICE_STATUS_CHANNEL, forward);
  return () => {
    electron.ipcRenderer.removeListener(SERVICE_STATUS_CHANNEL, forward);
  };
}

async function server(): Promise<DesktopServer> {
  const channel = 'desktop:server';
  const fields = fieldsOf(channel, 'a server', await invoke(channel, undefined));
  return { url: stringOf(channel, fields, 'url'), token: stringOf(channel, fields, 'token') };
}

async function serviceLogs(): Promise<DesktopServiceLogs> {
  const channel = 'desktop:service-logs';
  const fields = fieldsOf(channel, 'service logs', await invoke(channel, undefined));
  const lines = fields['lines'];
  if (!isList(lines) || !lines.every(isString)) {
    throw new BridgeAnswerError(channel, 'a list of log lines');
  }
  return { file: stringOf(channel, fields, 'file'), lines: lines.filter(isString) };
}

async function checkFfmpeg(): Promise<DesktopFfmpeg> {
  const channel = 'desktop:ffmpeg';
  const fields = fieldsOf(channel, 'an ffmpeg check', await invoke(channel, undefined));
  return {
    found: booleanOf(channel, fields, 'found'),
    path: nullableStringOf(channel, fields, 'path'),
    instructions: stringOf(channel, fields, 'instructions'),
  };
}

const FIREWALL_OUTCOMES: readonly DesktopFirewallOutcome[] = [
  'applied',
  'declined',
  'failed',
  'stale',
];

async function applyFirewall(revision: string): Promise<DesktopFirewallResult> {
  const channel = 'desktop:firewall-apply';
  const fields = fieldsOf(channel, 'a firewall result', await invoke(channel, revision));
  return {
    outcome: choiceOf(channel, fields, 'outcome', FIREWALL_OUTCOMES),
    detail: stringOf(channel, fields, 'detail'),
  };
}

const TALK_KINDS: readonly DesktopTalkCommand['kind'][] = [
  'press',
  'release',
  'toggle',
  'next',
  'select',
  'open',
];

function talkCommandOf(value: unknown): DesktopTalkCommand | null {
  if (!isFields(value) || !oneOf(TALK_KINDS, value['kind'])) {
    return null;
  }
  const kind = value['kind'];
  if (kind !== 'select') {
    return { kind };
  }
  const channelId = value['channelId'];
  return isString(channelId) ? { kind, channelId } : null;
}

function onTalkCommand(listener: (command: DesktopTalkCommand) => void): () => void {
  const forward = (_event: unknown, value: unknown): void => {
    const command = talkCommandOf(value);
    if (command !== null) {
      listener(command);
    }
  };
  electron.ipcRenderer.on(TALK_COMMAND_CHANNEL, forward);
  return () => {
    electron.ipcRenderer.removeListener(TALK_COMMAND_CHANNEL, forward);
  };
}

const TALK_BACKENDS: readonly DesktopTalkShortcuts['backend'][] = ['portal', 'electron'];

async function talkShortcutsFrom(
  channel: 'desktop:talk-shortcuts' | 'desktop:talk-configure',
): Promise<DesktopTalkShortcuts> {
  const fields = fieldsOf(channel, 'walkie-talkie shortcuts', await invoke(channel, undefined));
  return {
    backend: choiceOf(channel, fields, 'backend', TALK_BACKENDS),
    hold: booleanOf(channel, fields, 'hold'),
    talk: nullableStringOf(channel, fields, 'talk'),
    next: nullableStringOf(channel, fields, 'next'),
    problem: nullableStringOf(channel, fields, 'problem'),
  };
}

async function setTalkTray(tray: DesktopTalkTray): Promise<void> {
  await invoke('desktop:talk-tray', tray);
}

const desktop: SmartEverythingDesktop = {
  platform: platformOfProcess(),
  version: versionOfProcess(),
  notify: async (notification) => {
    await invoke('desktop:notify', { title: notification.title, body: notification.body });
  },
  getStartOnLogin: () => invokeForBoolean('desktop:get-start-on-login', undefined),
  setStartOnLogin: (enabled) => invokeForBoolean('desktop:set-start-on-login', enabled),
  onDeepLink,
  takePendingDeepLinks: takeDeepLinks,
  server,
  serviceStatus: () => invokeForStatus('desktop:service-status'),
  startService: () => invokeForStatus('desktop:service-start'),
  stopService: () => invokeForStatus('desktop:service-stop'),
  restartService: () => invokeForStatus('desktop:service-restart'),
  uninstallService: () => invokeForStatus('desktop:service-uninstall'),
  enableServiceLinger: () => invokeForStatus('desktop:service-enable-linger'),
  serviceLogs,
  onServiceStatus,
  checkFfmpeg,
  applyFirewall,
  onTalkCommand,
  talkShortcuts: () => talkShortcutsFrom('desktop:talk-shortcuts'),
  configureTalkShortcuts: () => talkShortcutsFrom('desktop:talk-configure'),
  setTalkTray,
  attention: async () => {
    await invoke('desktop:attention', undefined);
  },
};

electron.contextBridge.exposeInMainWorld(GLOBAL_NAME, desktop);
