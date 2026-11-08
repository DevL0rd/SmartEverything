import { defineBuiltinPlugin } from '../define';
import { OPENRGB_AUTOMATION, OPENRGB_STATUS_STREAM, startWithProfiles } from './automation';
import { OPENRGB_MODEL_ENTRIES } from './models';
import { startOpenRgb } from './runtime';
import { OPENRGB_SETTINGS, OPENRGB_SETTINGS_FORM } from './settings';

export const openRgbPlugin = defineBuiltinPlugin({
  manifest: {
    id: 'openrgb',
    name: 'OpenRGB',
    version: '1.0.0',
    publisher: 'SmartEverything',
    icon: 'lightbulb',
    description:
      'Control the RGB lighting of a PC through OpenRGB: motherboard, RAM, fans, strips and keyboards appear as lights. In OpenRGB, open the SDK Server tab and press Start Server.',
    contributes: {
      data: [
        {
          stream: OPENRGB_STATUS_STREAM,
          title: 'OpenRGB',
          schema: { type: 'object' },
          history: 0,
          live: true,
        },
      ],
      automation: OPENRGB_AUTOMATION,
      settings: OPENRGB_SETTINGS_FORM,
      deviceFamilies: ['light'],
    },
  },
  models: OPENRGB_MODEL_ENTRIES,
  settings: OPENRGB_SETTINGS,
  start: (ctx) => Promise.resolve(startWithProfiles(ctx, startOpenRgb)),
});
