import type { PluginManifestInput } from '@smarteverything/domain';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import { CLIENT_JOINED_EVENT, CLIENT_LEFT_EVENT } from './client-registry';
import { SNAPSHOT_STREAM, SPEED_TEST_STREAM, startRouter } from './runtime';
import { ROUTER_SETTINGS, ROUTER_SETTINGS_FORM } from './settings';

const CLIENT_FIELDS = { mac: 'string', name: 'string', profile_id: 'string' } as const;

const ROUTER_MANIFEST: PluginManifestInput = {
  id: 'router',
  name: 'Router',
  version: '1.0.0',
  description:
    'Your ASUS router on Asuswrt-Merlin: internet, Wi-Fi, devices on the network and speed tests.',
  publisher: 'SmartEverything',
  icon: 'router',
  contributes: {
    data: [
      {
        stream: SNAPSHOT_STREAM,
        title: 'Router',
        schema: { type: 'object' },
        history: 0,
        live: true,
      },
      { stream: SPEED_TEST_STREAM, title: 'Speed test', schema: { type: 'object' }, history: 0 },
    ],
    events: [
      { kind: CLIENT_JOINED_EVENT, title: 'Device joined the network', fields: CLIENT_FIELDS },
      { kind: CLIENT_LEFT_EVENT, title: 'Device left the network', fields: CLIENT_FIELDS },
    ],
    widgets: [
      figureWidget('router-internet', 'Internet', 'globe', SNAPSHOT_STREAM),
      figureWidget('router-people', 'Who’s home', 'users', SNAPSHOT_STREAM),
    ],
    settings: ROUTER_SETTINGS_FORM,
    search: 'push',
    deviceFamilies: ['router'],
  },
};

export const routerPlugin = defineBuiltinPlugin({
  manifest: ROUTER_MANIFEST,
  settings: ROUTER_SETTINGS,
  start: (ctx) => Promise.resolve(startRouter(ctx)),
});
