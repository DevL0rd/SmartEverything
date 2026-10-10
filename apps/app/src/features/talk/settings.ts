import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { ManageChannelsBlock } from './settings/manage-channels';
import { TalkDeviceRows } from './settings/talk-device-rows';
import { TalkMembershipRows } from './settings/talk-membership-rows';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'talk.device',
    page: 'talk',
    title: 'Walkie-talkie on this device',
    keywords: [
      'walkie talkie',
      'push to talk',
      'hold to talk',
      'shortcut',
      'headset',
      'background',
    ],
    scope: 'device-local',
    control: 'custom',
    render: () => createElement(TalkDeviceRows),
  },
  {
    id: 'talk.membership',
    page: 'talk',
    title: 'Channels on this device',
    keywords: ['join channel', 'leave channel', 'mute channel', 'sound'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(TalkMembershipRows),
  },
  {
    id: 'talk.channels',
    page: 'talk/channels',
    title: 'Manage channels',
    keywords: ['new channel', 'delete channel', 'members', 'cameras', 'priority', 'messages'],
    scope: 'server',
    control: 'custom',
    visible: (env) => env.owner,
    render: () => createElement(ManageChannelsBlock),
  },
];
