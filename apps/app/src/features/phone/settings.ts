import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { ThisPhoneRows } from './this-phone-rows';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'this-phone.node',
    page: 'this-phone',
    title: 'Share this phone with your home',
    keywords: [
      'phone',
      'driving',
      'walking',
      'cycling',
      'car bluetooth',
      'navigation',
      'screen time',
      'battery',
      'background',
      'home wi-fi',
      'do not disturb',
    ],
    scope: 'device-local',
    control: 'custom',
    render: () => createElement(ThisPhoneRows),
  },
];
