import type { PluginEvent, SyncActivity } from '@smarteverything/domain';
import { z } from 'zod';
import type { SyncthingEvent } from './rest-schemas';

export type RefreshPart =
  'config' | 'connections' | 'completion' | 'stats' | 'attention' | 'deviceStats';

export class RefreshPlan {
  full = false;
  readonly folders = new Set<string>();
  readonly parts = new Set<RefreshPart>();

  get empty(): boolean {
    return !this.full && this.folders.size === 0 && this.parts.size === 0;
  }

  merge(other: RefreshPlan): void {
    this.full ||= other.full;
    other.folders.forEach((folder) => this.folders.add(folder));
    other.parts.forEach((part) => this.parts.add(part));
  }
}

type Need = RefreshPart | 'folder';

const DEVICE_CHANGE: readonly Need[] = ['connections', 'completion', 'deviceStats'];
const RESTARTED: readonly Need[] = ['config', 'connections', 'attention', 'deviceStats'];
const FOLDER: readonly Need[] = ['folder'];

const EVENT_NEEDS: Readonly<Record<string, readonly Need[]>> = {
  FolderSummary: [],
  FolderErrors: FOLDER,
  StateChanged: FOLDER,
  FolderScanProgress: FOLDER,
  LocalIndexUpdated: FOLDER,
  RemoteIndexUpdated: FOLDER,
  LocalChangeDetected: FOLDER,
  RemoteChangeDetected: FOLDER,
  FolderWatchStateChanged: FOLDER,
  ItemFinished: ['folder', 'stats'],
  FolderCompletion: ['completion'],
  DeviceConnected: DEVICE_CHANGE,
  DeviceDisconnected: DEVICE_CHANGE,
  DevicePaused: DEVICE_CHANGE,
  DeviceResumed: DEVICE_CHANGE,
  ConfigSaved: ['config'],
  FolderPaused: ['config'],
  FolderResumed: ['config'],
  RemoteDownloadProgress: ['completion'],
  ClusterConfigReceived: ['completion'],
  DeviceRejected: ['attention'],
  FolderRejected: ['attention'],
  PendingDevicesChanged: ['attention'],
  PendingFoldersChanged: ['attention'],
  Failure: ['attention'],
  Starting: RESTARTED,
  StartupComplete: RESTARTED,
  ItemStarted: [],
  DownloadProgress: [],
  DeviceDiscovered: [],
  ListenAddressesChanged: [],
  LoginAttempt: [],
  UpgradeRestartScheduled: [],
};

const EVENT_DATA = z.looseObject({
  folder: z.string().optional(),
  folderID: z.string().optional(),
  id: z.string().optional(),
  device: z.string().optional(),
  action: z.string().optional(),
  path: z.string().optional(),
  modifiedBy: z.string().optional(),
  errors: z.array(z.unknown()).nullable().optional(),
  added: z.array(z.looseObject({})).nullable().optional(),
});

type EventData = z.output<typeof EVENT_DATA>;

function eventData(event: SyncthingEvent): EventData {
  const parsed = EVENT_DATA.safeParse(event.data);
  return parsed.success ? parsed.data : {};
}

export function planEvents(events: readonly SyncthingEvent[]): RefreshPlan {
  const plan = new RefreshPlan();
  for (const event of events) {
    const needs = EVENT_NEEDS[event.type];
    if (needs === undefined) {
      plan.full = true;
      continue;
    }
    const folder = folderOf(eventData(event));
    needs.forEach((need) => {
      if (need !== 'folder') {
        plan.parts.add(need);
      } else if (folder === null) {
        plan.full = true;
      } else {
        plan.folders.add(folder);
      }
    });
  }
  return plan;
}

function folderOf(data: EventData): string | null {
  return data.folder ?? data.folderID ?? null;
}

function deviceOf(data: EventData): string | null {
  return data.id ?? data.device ?? null;
}

const CHANGE_ACTIONS: Readonly<Record<string, SyncActivity['kind']>> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
};

const SIMPLE_ACTIVITY: Readonly<Record<string, SyncActivity['kind']>> = {
  DeviceConnected: 'connected',
  DeviceDisconnected: 'disconnected',
  DevicePaused: 'paused',
  DeviceResumed: 'resumed',
  FolderPaused: 'paused',
  FolderResumed: 'resumed',
};

const CHANGE_EVENTS: ReadonlySet<string> = new Set(['LocalChangeDetected', 'RemoteChangeDetected']);

function changeActivity(base: ActivityBase, event: SyncthingEvent, data: EventData): SyncActivity {
  const remote = event.type === 'RemoteChangeDetected';
  return {
    ...base,
    kind: CHANGE_ACTIONS[data.action ?? 'modified'] ?? 'modified',
    path: data.path ?? null,
    remote,
    deviceId: remote ? (data.modifiedBy ?? null) : null,
  };
}

type ActivityBase = Pick<SyncActivity, 'id' | 'at' | 'folderId' | 'deviceId' | 'remote'>;

export function activityOf(event: SyncthingEvent): SyncActivity | null {
  const data = eventData(event);
  const base: ActivityBase = {
    id: event.id,
    at: momentOf(event.time),
    folderId: folderOf(data),
    deviceId: null,
    remote: false,
  };
  if (CHANGE_EVENTS.has(event.type)) {
    return changeActivity(base, event, data);
  }
  if (event.type === 'FolderErrors') {
    return (data.errors?.length ?? 0) > 0 ? { ...base, kind: 'error', path: null } : null;
  }
  const simple = SIMPLE_ACTIVITY[event.type];
  return simple === undefined
    ? null
    : { ...base, kind: simple, path: null, deviceId: deviceOf(data) };
}

function momentOf(time: string): string {
  const parsed = new Date(time);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export const SYNC_ALERTS = {
  folderError: 'sync_folder_error',
  deviceInvite: 'sync_device_invite',
  folderInvite: 'sync_folder_invite',
  failure: 'sync_failure',
  deviceOverdue: 'sync_device_overdue',
  conflict: 'sync_conflict',
} as const;

export function alertOf(event: SyncthingEvent): PluginEvent | null {
  if (event.type === 'Failure') {
    const message = typeof event.data === 'string' ? event.data : 'Syncthing reported a failure';
    return { kind: SYNC_ALERTS.failure, subject: message.slice(0, 200), data: { message } };
  }
  return folderAlertOf(event) ?? inviteAlertOf(event);
}

function folderAlertOf(event: SyncthingEvent): PluginEvent | null {
  const data = eventData(event);
  const folder = folderOf(data);
  if (folder === null) {
    return null;
  }
  const errors = data.errors?.length ?? 0;
  if (event.type === 'FolderErrors' && errors > 0) {
    return {
      kind: SYNC_ALERTS.folderError,
      subject: folder,
      data: { folder_id: folder, count: errors },
    };
  }
  const path = data.path ?? '';
  if (event.type === 'LocalChangeDetected' && path.includes('.sync-conflict-')) {
    return { kind: SYNC_ALERTS.conflict, subject: folder, data: { folder_id: folder, path } };
  }
  return null;
}

function inviteAlertOf(event: SyncthingEvent): PluginEvent | null {
  const added = eventData(event).added?.length ?? 0;
  if (added === 0) {
    return null;
  }
  if (event.type === 'PendingDevicesChanged') {
    return { kind: SYNC_ALERTS.deviceInvite, subject: 'device', data: { count: added } };
  }
  if (event.type === 'PendingFoldersChanged') {
    return { kind: SYNC_ALERTS.folderInvite, subject: 'folder', data: { count: added } };
  }
  return null;
}
