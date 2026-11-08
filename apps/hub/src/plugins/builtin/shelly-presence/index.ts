import {
  SHELLY_PLUGIN_ID,
  SHELLY_SNAPSHOT_STREAM,
  SHELLY_TRACKS_STREAM,
} from '@smarteverything/shelly';
import { SHELLY_PRESENCE_GEN4_MODEL } from '@smarteverything/shelly';
import { entryFromSpec } from '../../../models/contributions';
import { defineBuiltinPlugin } from '../define';
import { SHELLY_AUTOMATION, SHELLY_ZONES_STREAM } from './automation';
import { startWithPickers } from './pickers';
import { startShelly } from './runtime';
import { SHELLY_SETTINGS, SHELLY_SETTINGS_FORM } from './settings';
export const shellyPresencePlugin = defineBuiltinPlugin({
  manifest: {
    id: SHELLY_PLUGIN_ID,
    name: 'Shelly Presence',
    version: '1.0.0',
    description:
      'Local Shelly Presence sensors, live room maps, zones and connected-device settings.',
    publisher: 'SmartEverything',
    icon: 'radar',
    contributes: {
      data: [
        {
          stream: SHELLY_SNAPSHOT_STREAM,
          title: 'Presence sensors',
          schema: { type: 'object' },
          history: 0,
        },
        {
          stream: SHELLY_TRACKS_STREAM,
          title: 'Live tracked objects',
          schema: { type: 'object' },
          history: 0,
          live: true,
        },
        {
          stream: SHELLY_ZONES_STREAM,
          title: 'Zone readings',
          schema: { type: 'object' },
          history: 0,
        },
      ],
      automation: SHELLY_AUTOMATION,
      settings: SHELLY_SETTINGS_FORM,
      search: 'push',
      deviceFamilies: ['sensor'],
    },
  },
  models: [
    entryFromSpec(SHELLY_PRESENCE_GEN4_MODEL, {
      match: { exact: ['S4SN-0U61X'] },
      brands: ['Shelly'],
    }),
  ],
  settings: SHELLY_SETTINGS,
  start: (ctx) => startWithPickers(ctx, startShelly),
});
