import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { PrivacyContent } from '../privacy';
import { AppVersionRow, ServerVersionRow } from './about/about-rows';
import { AddDeviceBlock } from './devices/add-device-block';
import { DevicesBlock } from './devices/devices-block';
import { MembersBlock } from './members/members-block';

export const OTHER_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'members.list',
    page: 'members',
    title: 'Paired phones and computers',
    keywords: ['paired', 'unpair', 'role', 'owner', 'member', 'phones', 'people'],
    scope: 'server',
    control: 'custom',
    visible: (env) => env.owner,
    render: () => createElement(MembersBlock),
  },
  {
    id: 'devices.list',
    page: 'devices',
    title: 'Hidden devices',
    keywords: ['hidden devices', 'show on home', 'visibility', 'unhide'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(DevicesBlock),
  },
  {
    id: 'devices.add',
    page: 'devices/add',
    title: 'Add a device',
    keywords: ['add device', 'new device', 'tv', 'link account'],
    scope: 'server',
    control: 'custom',
    visible: (env) => env.owner,
    render: () => createElement(AddDeviceBlock),
  },
  {
    id: 'about.app',
    page: 'about',
    section: 'Version',
    title: 'App version',
    keywords: ['version', 'build'],
    scope: 'device',
    control: 'custom',
    row: true,
    render: () => createElement(AppVersionRow),
  },
  {
    id: 'about.server',
    page: 'about',
    section: 'Version',
    title: 'Server version',
    keywords: ['server version'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(ServerVersionRow),
  },
  {
    id: 'about.licences',
    page: 'about/licences',
    title: 'Open-source licences',
    keywords: ['licences', 'licenses', 'open source', 'credits'],
    scope: 'device',
    control: 'link',
    href: '/settings/about/licences',
  },
  {
    id: 'about.privacy',
    page: 'about/privacy',
    title: 'Privacy policy',
    keywords: ['privacy', 'data', 'policy'],
    scope: 'device',
    control: 'custom',
    render: () => createElement(PrivacyContent),
  },
];
