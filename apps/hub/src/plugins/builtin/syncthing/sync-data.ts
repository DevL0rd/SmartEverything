import type { SyncthingRest } from './rest-client';
import {
  COMPLETION,
  CONFIG_DEVICE,
  CONFIG_FOLDER,
  CONNECTIONS,
  DEVICE_STATS,
  FOLDER_ERRORS,
  FOLDER_STATS,
  FOLDER_SUMMARY,
  PENDING_DEVICES,
  PENDING_FOLDERS,
  SYSTEM_ERRORS,
  SYSTEM_STATUS,
  SYSTEM_VERSION,
  type Completion,
  type ConfigDevice,
  type ConfigFolder,
  type Connections,
  type FolderSummary,
  type PendingDevices,
  type PendingFolders,
} from './rest-schemas';
import type { RefreshPart, RefreshPlan } from './event-plan';
import { z } from 'zod';

type FolderErrors = z.output<typeof FOLDER_ERRORS>['errors'];

export type FolderStats = z.output<typeof FOLDER_STATS>;

export interface SyncData {
  folders: readonly ConfigFolder[];
  devices: readonly ConfigDevice[];
  myId: string | null;
  version: string | null;
  uptimeSeconds: number | null;
  summaries: Map<string, FolderSummary>;
  folderErrors: Map<string, FolderErrors>;
  folderStats: FolderStats;
  deviceStats: z.output<typeof DEVICE_STATS>;
  connections: Connections | null;
  completion: Map<string, Completion>;
  systemErrors: z.output<typeof SYSTEM_ERRORS>['errors'];
  pendingDevices: PendingDevices;
  pendingFolders: PendingFolders;
}

export function emptySyncData(): SyncData {
  return {
    folders: [],
    devices: [],
    myId: null,
    version: null,
    uptimeSeconds: null,
    summaries: new Map(),
    folderErrors: new Map(),
    folderStats: {},
    deviceStats: {},
    connections: null,
    completion: new Map(),
    systemErrors: [],
    pendingDevices: {},
    pendingFolders: {},
  };
}

const PARTS: readonly RefreshPart[] = [
  'config',
  'connections',
  'completion',
  'stats',
  'attention',
  'deviceStats',
];

export class SyncDataLoader {
  constructor(
    private readonly rest: SyncthingRest,
    private readonly data: SyncData,
  ) {}

  async apply(plan: RefreshPlan): Promise<void> {
    const parts = plan.full ? PARTS : [...plan.parts];
    if (parts.includes('config')) {
      await this.config();
    }
    const folders = plan.full ? this.data.folders.map((folder) => folder.id) : [...plan.folders];
    await Promise.all([
      ...folders.map((id) => this.folder(id)),
      ...parts.filter((part) => part !== 'config').map((part) => this.#part(part)),
    ]);
  }

  async folder(id: string): Promise<void> {
    const query = { folder: id };
    const [summary, errors] = await Promise.all([
      this.rest.read('/rest/db/status', FOLDER_SUMMARY, { query }),
      this.rest.read('/rest/folder/errors', FOLDER_ERRORS, { query }),
    ]);
    this.data.summaries.set(id, summary);
    this.data.folderErrors.set(id, errors.errors);
  }

  async connections(): Promise<Connections> {
    const connections = await this.rest.read('/rest/system/connections', CONNECTIONS);
    this.data.connections = connections;
    return connections;
  }

  async config(): Promise<void> {
    const [folders, devices, status, version] = await Promise.all([
      this.rest.read('/rest/config/folders', z.array(CONFIG_FOLDER)),
      this.rest.read('/rest/config/devices', z.array(CONFIG_DEVICE)),
      this.rest.read('/rest/system/status', SYSTEM_STATUS),
      this.rest.read('/rest/system/version', SYSTEM_VERSION),
    ]);
    this.data.folders = folders;
    this.data.devices = devices.filter((device) => device.deviceID !== status.myID);
    this.data.myId = status.myID;
    this.data.uptimeSeconds = status.uptime;
    this.data.version = version.version;
    const known = new Set(folders.map((folder) => folder.id));
    [...this.data.summaries.keys()]
      .filter((id) => !known.has(id))
      .forEach((id) => this.data.summaries.delete(id));
  }

  async #part(part: Exclude<RefreshPart, 'config'>): Promise<void> {
    switch (part) {
      case 'connections':
        await this.connections();
        return;
      case 'completion':
        await this.#completion();
        return;
      case 'stats':
        this.data.folderStats = await this.rest.read('/rest/stats/folder', FOLDER_STATS);
        return;
      case 'deviceStats':
        this.data.deviceStats = await this.rest.read('/rest/stats/device', DEVICE_STATS);
        return;
      case 'attention':
        await this.#attention();
        return;
    }
  }

  async #completion(): Promise<void> {
    const entries = await Promise.all(
      this.data.devices.map(async (device): Promise<[string, Completion]> => {
        const query = { device: device.deviceID };
        return [
          device.deviceID,
          await this.rest.read('/rest/db/completion', COMPLETION, { query }),
        ];
      }),
    );
    this.data.completion = new Map(entries);
  }

  async #attention(): Promise<void> {
    const [errors, devices, folders] = await Promise.all([
      this.rest.read('/rest/system/error', SYSTEM_ERRORS),
      this.rest.read('/rest/cluster/pending/devices', PENDING_DEVICES),
      this.rest.read('/rest/cluster/pending/folders', PENDING_FOLDERS),
    ]);
    this.data.systemErrors = errors.errors;
    this.data.pendingDevices = devices;
    this.data.pendingFolders = folders;
  }
}
