import { createElement } from 'react';
import { href } from '../../app-shell/hrefs';
import type { SettingDefinition } from '../../settings/types';
import { WatchAppRows, WatchRelayRows } from './watch-relay-rows';
import { WatchSettingsPage } from './watch-settings-page';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'devices.add.watch',
    page: 'devices/add',
    section: 'Device plugins',
    title: 'Watch',
    description: 'Steps, heart rate and battery straight from your watch',
    icon: 'watch',
    keywords: ['watch', 'band', 'wearable', 'xiaomi', 'mi fitness', 'bluetooth'],
    scope: 'server',
    control: 'link',
    href: href.connect('watch'),
  },
  {
    id: 'health.watch.settings',
    page: 'health/watch-settings',
    title: 'Watch settings',
    keywords: [
      'alarms',
      'heart rate',
      'blood oxygen',
      'stress',
      'stand up',
      'sleep mode',
      'watch face',
    ],
    scope: 'device',
    control: 'custom',
    render: () => createElement(WatchSettingsPage),
  },
  {
    id: 'health.watch.phone',
    page: 'health/watch',
    title: 'Watch on this phone',
    keywords: [
      'notifications',
      'calls',
      'music',
      'find my phone',
      'apps',
      'privacy',
      'bridge',
      'take over',
      'another app',
      'bluetooth connection',
    ],
    scope: 'device-local',
    control: 'custom',
    render: () => createElement(WatchRelayRows),
  },
  {
    id: 'health.watch.apps',
    page: 'health/watch/apps',
    title: 'Notification apps',
    keywords: ['notifications', 'apps'],
    scope: 'device-local',
    control: 'custom',
    render: () => createElement(WatchAppRows),
  },
];
