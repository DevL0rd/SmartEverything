import { SHELLY_PRESENCE_PLUGIN_ID, SHELLY_PRESENCE_STREAM } from '@smarteverything/domain';
import { defineBuiltinPlugin } from '../define';
import { startShelly } from './runtime';
import { SHELLY_SETTINGS, SHELLY_SETTINGS_FORM } from './settings';
export const shellyPresencePlugin = defineBuiltinPlugin({
  manifest: {
    id: SHELLY_PRESENCE_PLUGIN_ID,
    name: 'Shelly Presence',
    version: '1.0.0',
    description:
      'Local Shelly Presence sensors, live room maps, zones and connected-device settings.',
    publisher: 'SmartEverything',
    icon: 'radar',
    contributes: {
      data: [
        {
          stream: SHELLY_PRESENCE_STREAM,
          title: 'Presence sensors',
          schema: { type: 'object' },
          history: 0,
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
