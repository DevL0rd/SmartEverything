import { join, resolve } from 'node:path';
import { DEVICE_ID, ITEM_ID } from './ids';
import type { LayoutNames } from './layout';

export const LAYOUT_SOURCES = ['legacy', 'v1'] as const;

export type LayoutSource = (typeof LAYOUT_SOURCES)[number];

export const LAYOUT_SOURCE: LayoutSource = 'legacy';

export function derivedShard(itemId: string): string {
  return ITEM_ID.parse(itemId.slice(0, 2));
}

export const LEGACY_NAMES: LayoutNames = {
  vendorHomes: true,
  marker: 'layout.json',
  lock: 'server.lock',
  tmp: 'tmp',
  database: {
    file: 'smarteverything.db',
    wal: 'smarteverything.db-wal',
    shm: 'smarteverything.db-shm',
  },
  keys: {
    ownerToken: 'owner-token',
    secretKey: 'secret.key',
    secrets: 'secrets.json.enc',
    tlsIdentity: 'hub-tls-identity.json',
  },
  config: { service: 'service.json' },
  run: {
    pid: 'service.pid',
    ready: 'service-ready.json',
    supervisorPid: 'supervisor.pid',
    restartRequest: 'service-restart',
    stopRequest: 'service-stop',
    nodeWindow: 'node-window.json',
    go2rtcConfig: 'go2rtc/go2rtc.yaml',
    sizeScan: 'size-scan.json',
  },
  logs: {
    service: 'service.log',
    serviceRotated: 'service.log.1',
    serviceOutput: 'service-output.log',
    perfSamples: 'perf-samples.jsonl',
    wakeDiagnostics: 'wake-diagnostics',
    hubUpdateWatchdog: 'hub-update-watchdog.log',
  },
  journal: '',
  ai: {
    assistant: 'assistant',
    claude: 'claude',
    codex: 'codex',
    harness: 'harness',
    claudeHome: 'claude-home',
    codexHome: 'codex-home',
  },
  developer: { watchCaptures: 'watch-captures' },
  updates: {
    appUpdates: 'app-updates',
    androidApks: 'android-apks',
    machineUpdates: 'machine-updates',
    machineUpdatesPrevious: 'machine-updates.previous',
    selfUpdate: 'self-update',
    appUpdatesLock: 'app-updates.write.lock',
  },
  migration: {
    journal: 'migration/journal',
    orphans: 'migration/orphans',
    staging: 'migration/staging',
  },
  home: { drive: 'drive/Shared', talk: 'talk', homeMapScans: 'home-map-scans' },
  cache: {
    harness: 'harness/cache',
    voiceSamples: 'voice-samples',
    smartthingsCapabilities: 'providers/smartthings/capabilities',
    codexInputs: 'codex/inputs',
    buildHost: 'build-host',
  },
  backups: { releases: 'release-backups', manual: 'backups', legacyDatabase: '' },
  provider: (id) => `providers/${id}`,
  plugin: (id) => `plugins/${id}`,
  journalCursor: (deviceId) => `startup-journal-${deviceId}.cursor`,
  recordings: (deviceId) => `recordings/${deviceId}`,
  derived: (itemId) => `drive-derived/${derivedShard(itemId)}`,
  person: {
    root: (profileId) => `drive/Members/${profileId}`,
    drive: (profileId) => `drive/Members/${profileId}`,
    attachments: () => 'assistant/files',
    harnessAttachments: () => 'harness',
  },
  chat: {
    root: (_profileId, chatId) => `assistant/projects/${chatId}`,
    project: (_profileId, chatId) => `assistant/projects/${chatId}`,
    codex: (_profileId, chatId) => `codex/workspaces/${chatId}`,
  },
};

export const LEGACY_NODE_NAMES = {
  ready: 'service-ready.json',
  ownerToken: 'owner-token',
  config: 'service.json',
  logs: {
    service: 'service.log',
    serviceOutput: 'service-output.log',
    wakeDiagnostics: 'wake-diagnostics',
  },
  computerNodeId: 'computer-node.id',
  nodeRoute: 'node-route.json',
  nodeWindow: 'node-window.json',
  supervisorPid: 'supervisor.pid',
  restartRequest: 'service-restart',
  stopRequest: 'service-stop',
  harness: 'harness',
  claudeHost: 'claude',
  codex: 'codex',
  codexInputs: 'codex/inputs',
  driveMountCache: 'drive-mounts',
  tmp: 'tmp',
  journalCursor: (deviceId: string): string => `startup-journal-${deviceId}.cursor`,
} as const;

export interface NodeLayout {
  readonly root: string;
  readonly ready: string;
  readonly ownerToken: string;
  readonly config: string;
  readonly logs: {
    readonly service: string;
    readonly serviceOutput: string;
    readonly wakeDiagnostics: string;
  };
  readonly computerNodeId: string;
  readonly nodeRoute: string;
  readonly nodeWindow: string;
  readonly supervisorPid: string;
  readonly restartRequest: string;
  readonly stopRequest: string;
  readonly journalCursor: (deviceId: string) => string;
  readonly harness: string;
  readonly claudeHost: string;
  readonly codex: string;
  readonly codexInputs: string;
  readonly driveMountCache: string;
  readonly tmp: string;
}

export function nodeLayout(root: string): NodeLayout {
  const absoluteRoot = resolve(root);
  const names = LEGACY_NODE_NAMES;
  const at = (name: string): string => join(absoluteRoot, name);
  return {
    root: absoluteRoot,
    ready: at(names.ready),
    ownerToken: at(names.ownerToken),
    config: at(names.config),
    logs: {
      service: at(names.logs.service),
      serviceOutput: at(names.logs.serviceOutput),
      wakeDiagnostics: at(names.logs.wakeDiagnostics),
    },
    computerNodeId: at(names.computerNodeId),
    nodeRoute: at(names.nodeRoute),
    nodeWindow: at(names.nodeWindow),
    supervisorPid: at(names.supervisorPid),
    restartRequest: at(names.restartRequest),
    stopRequest: at(names.stopRequest),
    journalCursor: (deviceId) => at(names.journalCursor(DEVICE_ID.parse(deviceId))),
    harness: at(names.harness),
    claudeHost: at(names.claudeHost),
    codex: at(names.codex),
    codexInputs: at(names.codexInputs),
    driveMountCache: at(names.driveMountCache),
    tmp: at(names.tmp),
  };
}
