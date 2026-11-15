import { createElement } from 'react';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { EmailSettings } from './email-settings';

export const EMAIL_PAGE = 'connections/email';

const owner = (env: SettingEnv): boolean => env.owner;

export const EMAIL_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'connections.email',
    page: EMAIL_PAGE,
    title: 'Outgoing email',
    icon: 'atSign',
    keywords: [
      'email',
      'smtp',
      'mail server',
      'invitations',
      'invites',
      'send a test',
      'from address',
      'booking confirmation',
    ],
    scope: 'server',
    visible: owner,
    control: 'custom',
    render: () => createElement(EmailSettings),
  },
];
