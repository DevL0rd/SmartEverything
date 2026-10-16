import type { AppPlugin } from '../contract';
import { WizSettings } from './settings';

export const wizAppPlugin: AppPlugin = {
  id: 'wiz',
  widgets: [],
  deviceSections: [],
  deviceSettings: [],
  settingsSearch: [
    {
      id: 'discover',
      title: 'Discover devices',
      focus: 'Discover devices',
      keywords: ['WiZ', 'discover', 'find', 'scan', 'bulbs', 'lights'],
    },
    {
      id: 'lights',
      title: 'WiZ lights',
      focus: 'WiZ lights',
      keywords: ['WiZ', 'connected', 'online', 'offline', 'bulbs', 'lights', 'control'],
    },
  ],
  settings: () => <WizSettings />,
};
