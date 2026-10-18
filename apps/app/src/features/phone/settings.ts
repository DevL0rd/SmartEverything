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
      'app usage',
      'share app usage',
      'notification titles',
      'share notification titles',
      'notification access',
      'modify system settings',
      'brightness permission',
      'display over other apps',
      'phone page',
      'phone setup',
    ],
    scope: 'device-local',
    control: 'custom',
    render: () => createElement(ThisPhoneRows),
  },
];
