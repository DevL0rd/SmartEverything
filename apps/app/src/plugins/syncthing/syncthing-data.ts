import {
  SYNC_ACTIVITY,
  SYNCTHING_SNAPSHOT,
  type SyncActivity,
  type SyncState,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StatusTone } from '../../components/tone';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import type { PluginNoticeText } from '../shared/plugin-notice';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';
import { usePluginTool, type PluginToolRunner } from '../use-plugin-tool';

export const SYNCTHING_PLUGIN = 'syncthing';

const ACTIVITY = z.array(SYNC_ACTIVITY);

export function useSyncthingSnapshot(): PluginStream<SyncthingSnapshot> {
  return usePluginStream(SYNCTHING_PLUGIN, 'syncthing.snapshot', SYNCTHING_SNAPSHOT);
}

export function useSyncActivity(): PluginStream<z.output<typeof ACTIVITY>> {
  return usePluginStream(SYNCTHING_PLUGIN, 'syncthing.activity', ACTIVITY);
}

export function useSyncthingTools(): PluginToolRunner {
  return usePluginTool(SYNCTHING_PLUGIN);
}

export function useSyncthingDevice(): Device | null {
  return useDevices({ includeHidden: true }).find((device) => device.kind === 'file_sync') ?? null;
}

export const SYNC_STATE_TEXT: Readonly<
  Record<SyncState, { readonly title: string; readonly tone: StatusTone | 'variant' }>
> = {
  in_sync: { title: 'Up to date', tone: 'positive' },
  syncing: { title: 'Syncing', tone: 'info' },
  paused: { title: 'Paused', tone: 'warning' },
  error: { title: 'Needs attention', tone: 'critical' },
  offline: { title: 'Not connected', tone: 'variant' },
  empty: { title: 'No folders yet', tone: 'variant' },
};

export function syncthingNotice(snapshot: SyncthingSnapshot): PluginNoticeText | null {
  const connection = snapshot.connection;
  switch (connection.state) {
    case 'not_set_up':
      return {
        tone: 'info',
        title: 'Syncthing not set up',
        body: 'Find Syncthing on this computer, or add its address and API key.',
        settings: true,
      };
    case 'connecting':
      return {
        tone: 'info',
        title: 'Connecting to Syncthing…',
        body: 'This takes a moment.',
        settings: false,
      };
    case 'key_rejected':
      return {
        tone: 'critical',
        title: 'Syncthing rejected the API key',
        body: 'Copy the key again from Syncthing’s settings.',
        settings: true,
      };
    case 'unreachable':
      return {
        tone: 'critical',
        title: 'Syncthing can’t be reached',
        body: connection.reason,
        settings: true,
      };
    case 'online':
      return null;
  }
}

const ACTIVITY_TEXT: Readonly<Record<SyncActivity['kind'], string>> = {
  added: 'Added',
  modified: 'Changed',
  deleted: 'Deleted',
  connected: 'Connected',
  disconnected: 'Disconnected',
  paused: 'Paused',
  resumed: 'Resumed',
  error: 'Errors in',
};

export function activityTitle(entry: SyncActivity, snapshot: SyncthingSnapshot | null): string {
  const target =
    entry.path ??
    folderLabel(snapshot, entry.folderId) ??
    peerName(snapshot, entry.deviceId) ??
    'Syncthing';
  return `${ACTIVITY_TEXT[entry.kind]} ${target}`;
}

export function folderLabel(snapshot: SyncthingSnapshot | null, id: string | null): string | null {
  return id === null ? null : (snapshot?.folders.find((folder) => folder.id === id)?.label ?? id);
}

export function peerName(snapshot: SyncthingSnapshot | null, id: string | null): string | null {
  return id === null
    ? null
    : (snapshot?.peers.find((peer) => peer.id === id)?.name ?? id.slice(0, 7));
}
