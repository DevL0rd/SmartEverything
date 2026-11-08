import type { PluginManifestInput } from '@smarteverything/domain';
import { entryFromSpec } from '../../../models/contributions';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import {
  CLIENT_JOINED,
  CLIENT_LEFT,
  PERSON_ARRIVED,
  PERSON_LEFT,
  ROUTER_AUTOMATION,
} from './automation';
import { ROUTER_MODEL_MATCH, ROUTER_MODELS } from './models';
import { SNAPSHOT_STREAM, SPEED_TEST_STREAM, startRouter } from './runtime';
import { ROUTER_SETTINGS, ROUTER_SETTINGS_FORM } from './settings';

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
    events: [CLIENT_JOINED, CLIENT_LEFT, PERSON_ARRIVED, PERSON_LEFT],
    widgets: [
      figureWidget('router-internet', 'Internet', 'globe', SNAPSHOT_STREAM),
      figureWidget('router-people', 'Who’s home', 'users', SNAPSHOT_STREAM),
    ],
    settings: ROUTER_SETTINGS_FORM,
    search: 'push',
    deviceFamilies: ['router'],
    automation: ROUTER_AUTOMATION,
  },
};

export const routerPlugin = defineBuiltinPlugin({
  manifest: ROUTER_MANIFEST,
  models: ROUTER_MODELS.map((spec) =>
    entryFromSpec(spec, { match: ROUTER_MODEL_MATCH, brands: ['ASUS'] }),
  ),
  settings: ROUTER_SETTINGS,
  start: (ctx) => Promise.resolve(startRouter(ctx)),
});
