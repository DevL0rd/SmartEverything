import type { PluginManifestInput } from '@smarteverything/domain';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import { SYNC_ALERTS } from './event-plan';
import { ACTIVITY_STREAM, SNAPSHOT_STREAM, startSyncthing } from './runtime';
import { SYNCTHING_SETTINGS, SYNCTHING_SETTINGS_FORM } from './settings';

const FOLDER_FIELDS = { folder_id: 'string' } as const;

const SYNCTHING_MANIFEST: PluginManifestInput = {
  id: 'syncthing',
  name: 'Syncthing',
  version: '1.0.0',
  description: 'Follow and control Syncthing: folders, devices, invitations and file activity.',
  publisher: 'SmartEverything',
  icon: 'folder-sync',
  contributes: {
    data: [
      {
        stream: SNAPSHOT_STREAM,
        title: 'Syncthing',
        schema: { type: 'object' },
        history: 0,
        live: true,
      },
      { stream: ACTIVITY_STREAM, title: 'File activity', schema: { type: 'array' }, history: 0 },
    ],
    events: [
      {
        kind: SYNC_ALERTS.folderError,
        title: 'A synced folder has errors',
        fields: { ...FOLDER_FIELDS, count: 'number' },
      },
      {
        kind: SYNC_ALERTS.conflict,
        title: 'A sync conflict appeared',
        fields: { ...FOLDER_FIELDS, path: 'string' },
      },
      {
        kind: SYNC_ALERTS.deviceInvite,
        title: 'A device wants to sync',
        fields: { count: 'number' },
      },
      {
        kind: SYNC_ALERTS.folderInvite,
        title: 'A folder was offered',
        fields: { count: 'number' },
      },
      {
        kind: SYNC_ALERTS.deviceOverdue,
        title: 'A sync device has been away too long',
        fields: { device_id: 'string', last_seen: 'string' },
      },
      {
        kind: SYNC_ALERTS.failure,
        title: 'Syncthing reported a failure',
        fields: { message: 'string' },
      },
    ],
    widgets: [figureWidget('syncthing-sync', 'Sync', 'folderSync', SNAPSHOT_STREAM)],
    settings: SYNCTHING_SETTINGS_FORM,
    search: 'push',
    deviceFamilies: ['file_sync'],
  },
};

export const syncthingPlugin = defineBuiltinPlugin({
  manifest: SYNCTHING_MANIFEST,
  settings: SYNCTHING_SETTINGS,
  start: (ctx) => Promise.resolve(startSyncthing(ctx)),
});
