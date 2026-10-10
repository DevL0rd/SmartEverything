import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { PeopleBlock } from './people-block';
import { ProfileSwitcher } from './profile-switcher';
import { ScaleBlock } from './scale-block';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'profiles.this-app',
    page: 'profiles',
    title: 'This app belongs to',
    description: 'Preferences, layouts and health data follow them',
    icon: 'smartphone',
    keywords: ['profile', 'person', 'switch', 'whose', 'wife', 'partner'],
    scope: 'client',
    control: 'custom',
    row: true,
    render: () => createElement(ProfileSwitcher),
  },
  {
    id: 'profiles.people',
    page: 'profiles',
    section: 'People',
    title: 'People',
    icon: 'users',
    keywords: ['profile', 'person', 'height', 'birthday', 'body composition', 'add person'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(PeopleBlock),
  },
  {
    id: 'profiles.scale',
    page: 'profiles',
    section: 'Weigh-ins',
    title: 'Bluetooth scale',
    icon: 'scale',
    keywords: ['scale', 'weight', 'xiaomi', 's400', 'bluetooth', 'weigh'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(ScaleBlock),
  },
];
