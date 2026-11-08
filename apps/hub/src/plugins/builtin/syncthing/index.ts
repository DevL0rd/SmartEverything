import type { PluginManifestInput } from '@smarteverything/domain';
import { entryFromSpec } from '../../../models/contributions';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import { SYNCTHING_AUTOMATION } from './automation';
import { SYNCTHING_EVENTS } from './automation-events';
import { SYNCTHING_MODEL_MATCH, SYNCTHING_MODELS } from './models';
import { startWithPickers } from './pickers';
import { ACTIVITY_STREAM, SNAPSHOT_STREAM, startSyncthing } from './runtime';
import { SYNCTHING_SETTINGS, SYNCTHING_SETTINGS_FORM } from './settings';

const summaryOf = (field: string): { stream: string; field: string } => ({
  stream: SNAPSHOT_STREAM,
  field: `summary.${field}`,
});

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
    events: [...SYNCTHING_EVENTS],
    automation: SYNCTHING_AUTOMATION,
    widgets: [
      figureWidget('syncthing-sync', 'Sync', 'folderSync', SNAPSHOT_STREAM),
      {
        id: 'syncthing-peers',
        title: 'Sync peers online',
        icon: 'users',
        sizes: ['W'],
        body: { type: 'figure', value: summaryOf('peersOnline'), caption: 'Peers online' },
      },
    ],
    pages: [
      {
        id: 'overview',
        title: 'Sync overview',
        icon: 'folderSync',
        sections: [
          {
            title: 'Peers online',
            body: {
              type: 'figure',
              value: summaryOf('peersOnline'),
              caption: 'Devices connected now',
            },
          },
          {
            title: 'Folders behind',
            body: {
              type: 'figure',
              value: summaryOf('foldersBehind'),
              caption: 'Folders still syncing',
            },
          },
          {
            title: 'Download (bytes per second)',
            body: { type: 'sparkline', value: summaryOf('downloadBytesPerSecond'), minutes: 30 },
          },
          {
            title: 'Upload (bytes per second)',
            body: { type: 'sparkline', value: summaryOf('uploadBytesPerSecond'), minutes: 30 },
          },
        ],
      },
    ],
    settings: SYNCTHING_SETTINGS_FORM,
    search: 'push',
    deviceFamilies: ['file_sync'],
  },
};

export const syncthingPlugin = defineBuiltinPlugin({
  manifest: SYNCTHING_MANIFEST,
  models: SYNCTHING_MODELS.map((spec) =>
    entryFromSpec(spec, { match: SYNCTHING_MODEL_MATCH, brands: ['Syncthing'] }),
  ),
  settings: SYNCTHING_SETTINGS,
  start: (ctx) => startWithPickers(ctx, startSyncthing),
});
