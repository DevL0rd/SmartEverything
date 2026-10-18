import {
  SHELLY_PLUGIN_ID,
  SHELLY_SNAPSHOT_STREAM,
  SHELLY_TRACKS_STREAM,
} from '@smarteverything/shelly';
import { defineBuiltinPlugin } from '../define';
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
      ],
      settings: SHELLY_SETTINGS_FORM,
      search: 'push',
      deviceFamilies: ['presence'],
    },
  },
  settings: SHELLY_SETTINGS,
  start: startShelly,
});
