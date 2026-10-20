import { defineBuiltinPlugin } from '../define';
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
      settings: OPENRGB_SETTINGS_FORM,
      deviceFamilies: ['light'],
    },
  },
  settings: OPENRGB_SETTINGS,
  start: (ctx) => Promise.resolve(startOpenRgb(ctx)),
});
