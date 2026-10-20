import { createElement } from 'react';
import { href } from '../../app-shell/hrefs';
import type { SettingDefinition } from '../../settings/types';
import { PrivacyContent } from '../privacy';
import { AppVersionRow, ServerVersionRow } from './about/about-rows';
import { PairComputerRow } from './devices/pair-computer-row';
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
    title: 'Devices',
    keywords: ['all devices', 'hidden devices', 'show on home', 'visibility', 'unhide'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(DevicesBlock),
  },
  {
    id: 'devices.add.computer',
    page: 'devices/add',
    section: 'Computers',
    title: 'Pair a computer',
    description: 'Use Claude and Codex on a computer',
    icon: 'monitor',
    keywords: ['computer', 'pair', 'claude', 'codex', 'desktop'],
    scope: 'server',
    control: 'custom',
    row: true,
    visible: (env) => env.owner,
    render: () => createElement(PairComputerRow),
  },
  {
    id: 'devices.add.address',
    page: 'devices/add',
    section: 'On your network',
    title: 'Add by address',
    description: 'TVs and other devices no account brings in',
    icon: 'router',
    keywords: ['address', 'ip', 'tv', 'network', 'manual'],
    scope: 'server',
    control: 'link',
    visible: (env) => env.owner,
    href: href.addByAddress(),
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
