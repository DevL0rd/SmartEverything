import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  ATTACHMENT_ID,
  ATTACHMENT_NAME,
  CHAT_ID,
  DEVICE_ID,
  ITEM_ID,
  PLUGIN_ID,
  PROFILE_ID,
  PROVIDER_ID,
  ROOT_ID,
} from './ids';
import { derivedShard, LAYOUT_SOURCE, LEGACY_NAMES, type LayoutSource } from './legacy';

type Paths<K extends string> = Readonly<Record<K, string>>;

export interface LayoutNames {
  readonly vendorHomes: boolean;
  readonly marker: string;
  readonly lock: string;
  readonly tmp: string;
  readonly database: Paths<'file' | 'wal' | 'shm'>;
  readonly keys: Paths<'ownerToken' | 'secretKey' | 'secrets' | 'tlsIdentity'>;
  readonly config: Paths<'service'>;
  readonly run: Paths<
    | 'pid'
    | 'ready'
    | 'supervisorPid'
    | 'restartRequest'
    | 'stopRequest'
    | 'nodeWindow'
    | 'go2rtcConfig'
    | 'sizeScan'
  >;
  readonly logs: Paths<
    | 'service'
    | 'serviceRotated'
    | 'serviceOutput'
    | 'perfSamples'
    | 'wakeDiagnostics'
    | 'hubUpdateWatchdog'
  >;
  readonly journal: string;
  readonly ai: Paths<'assistant' | 'claude' | 'codex' | 'harness' | 'claudeHome' | 'codexHome'>;
  readonly developer: Paths<'watchCaptures'>;
  readonly updates: Paths<
    | 'appUpdates'
    | 'androidApks'
    | 'machineUpdates'
    | 'machineUpdatesPrevious'
    | 'selfUpdate'
    | 'appUpdatesLock'
  >;
  readonly migration: Paths<'journal' | 'orphans' | 'staging'>;
  readonly home: Paths<'drive' | 'talk' | 'homeMapScans'>;
  readonly cache: Paths<'harness' | 'voiceSamples' | 'smartthingsCapabilities' | 'codexInputs'>;
  readonly backups: Paths<'releases' | 'manual' | 'legacyDatabase'>;
  readonly provider: (id: string) => string;
  readonly plugin: (id: string) => string;
  readonly driveMeta: (rootId: string) => string;
  readonly journalCursor: (deviceId: string) => string;
  readonly recordings: (deviceId: string) => string;
  readonly derived: (itemId: string) => string;
  readonly person: {
    readonly root: (profileId: string) => string;
    readonly drive: (profileId: string) => string;
    readonly attachments: (profileId: string) => string;
    readonly harnessAttachments: (profileId: string) => string;
  };
  readonly chat: {
    readonly root: (profileId: string, chatId: string) => string;
    readonly project: (profileId: string, chatId: string) => string;
    readonly codex: (profileId: string, chatId: string) => string;
  };
}

export const V1_NAMES: LayoutNames = {
  vendorHomes: false,
  marker: 'layout.json',
  lock: 'server.lock',
  tmp: 'tmp',
  database: {
    file: 'system/database/smarteverything.db',
    wal: 'system/database/smarteverything.db-wal',
    shm: 'system/database/smarteverything.db-shm',
  },
  keys: {
    ownerToken: 'system/keys/owner-token',
    secretKey: 'system/keys/secret.key',
    secrets: 'system/keys/secrets.json.enc',
    tlsIdentity: 'system/keys/hub-tls-identity.json',
  },
  config: { service: 'system/config/service.json' },
  run: {
    pid: 'system/run/service.pid',
    ready: 'system/run/service-ready.json',
    supervisorPid: 'system/run/supervisor.pid',
    restartRequest: 'system/run/service-restart',
    stopRequest: 'system/run/service-stop',
    nodeWindow: 'system/run/node-window.json',
    go2rtcConfig: 'system/run/go2rtc.yaml',
    sizeScan: 'system/run/size-scan.json',
  },
  logs: {
    service: 'system/logs/service.log',
    serviceRotated: 'system/logs/service.log.1',
    serviceOutput: 'system/logs/service-output.log',
    perfSamples: 'system/logs/perf-samples.jsonl',
    wakeDiagnostics: 'system/logs/wake-diagnostics',
    hubUpdateWatchdog: 'system/logs/hub-update-watchdog.log',
  },
  journal: 'system/journal',
  ai: {
    assistant: 'system/ai/assistant',
    claude: 'system/ai/claude',
    codex: 'system/ai/codex',
    harness: 'system/ai/harness',
    claudeHome: 'system/ai/claude-home',
    codexHome: 'system/ai/codex-home',
  },
  developer: { watchCaptures: 'system/developer/watch-captures' },
  updates: {
    appUpdates: 'system/updates/app-updates',
    androidApks: 'system/updates/android-apks',
    machineUpdates: 'system/updates/machine-updates',
    machineUpdatesPrevious: 'system/updates/machine-updates.previous',
    selfUpdate: 'system/updates/self-update',
    appUpdatesLock: 'system/updates/app-updates.write.lock',
  },
  migration: {
    journal: 'system/migration/journal',
    orphans: 'system/migration/orphans',
    staging: 'system/migration/staging',
  },
  home: { drive: 'home/drive', talk: 'home/talk', homeMapScans: 'home/home-map/scans' },
  cache: {
    harness: 'cache/harness',
    voiceSamples: 'cache/voice-samples',
    smartthingsCapabilities: 'cache/smartthings-capabilities',
    codexInputs: 'cache/codex-inputs',
  },
  backups: {
    releases: 'backups/releases',
    manual: 'backups/manual',
    legacyDatabase: 'backups/legacy-database',
  },
  provider: (id) => `system/providers/${id}`,
  plugin: (id) => `system/plugins/${id}`,
  driveMeta: (rootId) => `system/drive-meta/${rootId}`,
  journalCursor: (deviceId) => `system/journal/startup-journal-${deviceId}.cursor`,
  recordings: (deviceId) => `home/cameras/recordings/${deviceId}`,
  derived: (itemId) => `cache/drive-derived/${derivedShard(itemId)}`,
  person: {
    root: (profileId) => `people/${profileId}`,
    drive: (profileId) => `people/${profileId}/drive`,
    attachments: (profileId) => `people/${profileId}/attachments`,
    harnessAttachments: (profileId) => `people/${profileId}/ai/harness-attachments`,
  },
  chat: {
    root: (profileId, chatId) => `people/${profileId}/chats/${chatId}`,
    project: (profileId, chatId) => `people/${profileId}/chats/${chatId}/project`,
    codex: (profileId, chatId) => `people/${profileId}/chats/${chatId}/codex`,
  },
};

const NAMES: Readonly<Record<LayoutSource, LayoutNames>> = {
  legacy: LEGACY_NAMES,
  v1: V1_NAMES,
};

export interface LayoutEnvironment {
  readonly CLAUDE_CONFIG_DIR?: string | undefined;
  readonly CODEX_HOME?: string | undefined;
}

export interface PersonLayout {
  readonly root: string;
  readonly drive: string;
  readonly attachments: string;
  readonly attachment: (attachmentId: string, name: string) => string;
  readonly harnessAttachments: string;
}

export interface ChatLayout {
  readonly root: string;
  readonly project: string;
  readonly codex: string;
}

export interface HubLayout {
  readonly root: string;
  readonly marker: string;
  readonly lock: string;
  readonly tmp: string;
  readonly system: {
    readonly database: Paths<'file' | 'wal' | 'shm'>;
    readonly keys: Paths<'ownerToken' | 'secretKey' | 'secrets' | 'tlsIdentity'>;
    readonly config: Paths<'service'>;
    readonly run: LayoutNames['run'];
    readonly logs: LayoutNames['logs'];
    readonly journal: string;
    readonly journalCursor: (deviceId: string) => string;
    readonly ai: LayoutNames['ai'];
    readonly providers: (providerId: string) => string;
    readonly plugins: (pluginId: string) => string;
    readonly driveMeta: (rootId: string) => string;
    readonly developer: LayoutNames['developer'];
    readonly updates: LayoutNames['updates'];
    readonly migration: LayoutNames['migration'];
  };
  readonly home: {
    readonly drive: string;
    readonly recordings: (deviceId: string) => string;
    readonly talk: string;
    readonly homeMapScans: string;
  };
  readonly person: (profileId: string) => PersonLayout;
  readonly chat: (profileId: string, chatId: string) => ChatLayout;
  readonly cache: {
    readonly derived: (itemId: string) => string;
    readonly harness: string;
    readonly voiceSamples: string;
    readonly smartthingsCapabilities: string;
    readonly codexInputs: string;
  };
  readonly backups: LayoutNames['backups'];
}

type At = (relative: string) => string;

function rootedIn(root: string): At {
  return (relative) => (relative === '' ? root : join(root, ...relative.split('/')));
}

function vendorHome(configured: string | undefined, fallback: string): string {
  return configured !== undefined && isAbsolute(configured) ? configured : fallback;
}

function aiOf(names: LayoutNames, at: At, environment: LayoutEnvironment): LayoutNames['ai'] {
  const { ai } = names;
  return {
    assistant: at(ai.assistant),
    claude: at(ai.claude),
    codex: at(ai.codex),
    harness: at(ai.harness),
    claudeHome: names.vendorHomes
      ? vendorHome(environment.CLAUDE_CONFIG_DIR, join(homedir(), '.claude'))
      : at(ai.claudeHome),
    codexHome: names.vendorHomes
      ? vendorHome(environment.CODEX_HOME, join(homedir(), '.codex'))
      : at(ai.codexHome),
  };
}

function runOf(names: LayoutNames, at: At): LayoutNames['run'] {
  const { run } = names;
  return {
    pid: at(run.pid),
    ready: at(run.ready),
    supervisorPid: at(run.supervisorPid),
    restartRequest: at(run.restartRequest),
    stopRequest: at(run.stopRequest),
    nodeWindow: at(run.nodeWindow),
    go2rtcConfig: at(run.go2rtcConfig),
    sizeScan: at(run.sizeScan),
  };
}

function logsOf(names: LayoutNames, at: At): LayoutNames['logs'] {
  const { logs } = names;
  return {
    service: at(logs.service),
    serviceRotated: at(logs.serviceRotated),
    serviceOutput: at(logs.serviceOutput),
    perfSamples: at(logs.perfSamples),
    wakeDiagnostics: at(logs.wakeDiagnostics),
    hubUpdateWatchdog: at(logs.hubUpdateWatchdog),
  };
}

function updatesOf(names: LayoutNames, at: At): LayoutNames['updates'] {
  const { updates } = names;
  return {
    appUpdates: at(updates.appUpdates),
    androidApks: at(updates.androidApks),
    machineUpdates: at(updates.machineUpdates),
    machineUpdatesPrevious: at(updates.machineUpdatesPrevious),
    selfUpdate: at(updates.selfUpdate),
    appUpdatesLock: at(updates.appUpdatesLock),
  };
}

function storageOf(
  names: LayoutNames,
  at: At,
): Pick<HubLayout['system'], 'database' | 'keys' | 'config'> {
  const { database, keys, config } = names;
  return {
    database: { file: at(database.file), wal: at(database.wal), shm: at(database.shm) },
    keys: {
      ownerToken: at(keys.ownerToken),
      secretKey: at(keys.secretKey),
      secrets: at(keys.secrets),
      tlsIdentity: at(keys.tlsIdentity),
    },
    config: { service: at(config.service) },
  };
}

function systemOf(names: LayoutNames, at: At, environment: LayoutEnvironment): HubLayout['system'] {
  const { migration } = names;
  return {
    ...storageOf(names, at),
    run: runOf(names, at),
    logs: logsOf(names, at),
    journal: at(names.journal),
    journalCursor: (deviceId) => at(names.journalCursor(DEVICE_ID.parse(deviceId))),
    ai: aiOf(names, at, environment),
    providers: (id) => at(names.provider(PROVIDER_ID.parse(id))),
    plugins: (id) => at(names.plugin(PLUGIN_ID.parse(id))),
    driveMeta: (id) => at(names.driveMeta(ROOT_ID.parse(id))),
    developer: { watchCaptures: at(names.developer.watchCaptures) },
    updates: updatesOf(names, at),
    migration: {
      journal: at(migration.journal),
      orphans: at(migration.orphans),
      staging: at(migration.staging),
    },
  };
}

function personOf(names: LayoutNames, at: At, profileId: string): PersonLayout {
  const profile = PROFILE_ID.parse(profileId);
  const attachments = at(names.person.attachments(profile));
  return {
    root: at(names.person.root(profile)),
    drive: at(names.person.drive(profile)),
    attachments,
    attachment: (attachmentId, name) =>
      join(attachments, ATTACHMENT_ID.parse(attachmentId), ATTACHMENT_NAME.parse(name)),
    harnessAttachments: at(names.person.harnessAttachments(profile)),
  };
}

function chatOf(names: LayoutNames, at: At, profileId: string, chatId: string): ChatLayout {
  const profile = PROFILE_ID.parse(profileId);
  const chat = CHAT_ID.parse(chatId);
  return {
    root: at(names.chat.root(profile, chat)),
    project: at(names.chat.project(profile, chat)),
    codex: at(names.chat.codex(profile, chat)),
  };
}

export function layoutFromNames(
  root: string,
  names: LayoutNames,
  environment: LayoutEnvironment,
): HubLayout {
  const absoluteRoot = resolve(root);
  const at = rootedIn(absoluteRoot);
  const { home, cache, backups } = names;
  return {
    root: absoluteRoot,
    marker: at(names.marker),
    lock: at(names.lock),
    tmp: at(names.tmp),
    system: systemOf(names, at, environment),
    home: {
      drive: at(home.drive),
      recordings: (id) => at(names.recordings(DEVICE_ID.parse(id))),
      talk: at(home.talk),
      homeMapScans: at(home.homeMapScans),
    },
    person: (profileId) => personOf(names, at, profileId),
    chat: (profileId, chatId) => chatOf(names, at, profileId, chatId),
    cache: {
      derived: (id) => at(names.derived(ITEM_ID.parse(id))),
      harness: at(cache.harness),
      voiceSamples: at(cache.voiceSamples),
      smartthingsCapabilities: at(cache.smartthingsCapabilities),
      codexInputs: at(cache.codexInputs),
    },
    backups: {
      releases: at(backups.releases),
      manual: at(backups.manual),
      legacyDatabase: at(backups.legacyDatabase),
    },
  };
}

export function hubLayout(root: string, environment: LayoutEnvironment): HubLayout {
  return layoutFromNames(root, NAMES[LAYOUT_SOURCE], environment);
}
