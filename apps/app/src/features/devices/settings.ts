import { href } from '../../app-shell/hrefs';
import type { SettingDefinition } from '../../settings/types';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'devices.add.bluetooth-scale',
    page: 'devices/add',
    section: 'Bluetooth',
    title: 'Bluetooth scale',
    description: 'Weigh-ins go to whoever steps on',
    icon: 'scale',
    keywords: ['scale', 'weight', 'bluetooth', 'body'],
    scope: 'server',
    control: 'link',
    href: href.connect('scale'),
  },
];
