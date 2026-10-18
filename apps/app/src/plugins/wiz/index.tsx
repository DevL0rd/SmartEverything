import type { AppPlugin } from '../contract';
import { WIZ_DISCOVER, WIZ_LIGHTS, WizSettings } from './settings';

export const wizAppPlugin: AppPlugin = {
  id: 'wiz',
  widgets: [],
  deviceSections: [],
  deviceSettings: [],
  settingsSearch: [
    {
      id: WIZ_DISCOVER,
      title: 'Discover devices',
      keywords: ['WiZ', 'discover', 'find', 'scan', 'bulbs', 'lights'],
    },
    {
      id: WIZ_LIGHTS,
      title: 'WiZ lights',
      keywords: ['WiZ', 'connected', 'online', 'offline', 'bulbs', 'lights', 'control'],
    },
  ],
  settings: () => <WizSettings />,
};
