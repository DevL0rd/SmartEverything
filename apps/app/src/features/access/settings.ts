import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { AuditList } from './components/audit-list';
import { PeopleAccessBlock } from './components/people-access-block';
import { RequestsInbox } from './components/requests-inbox';

const AUDIT_LIMIT = 50;

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'access.requests',
    page: 'access',
    title: 'Requests for more access',
    icon: 'key',
    keywords: ['request', 'ask', 'approve', 'deny', 'allow', 'permission', 'grant', 'owner'],
    scope: 'server',
    control: 'custom',
    visible: (env) => env.owner,
    render: () => createElement(RequestsInbox),
  },
  {
    id: 'access.people',
    page: 'access',
    title: 'Who can do what',
    icon: 'key',
    keywords: [
      'access',
      'role',
      'owner',
      'member',
      'guest',
      'child',
      'permissions',
      'pause',
      'schedule',
      'bedtime',
      'home network',
      'expire',
      'revoke',
    ],
    scope: 'server',
    control: 'custom',
    visible: (env) => env.owner,
    render: () => createElement(PeopleAccessBlock),
  },
  {
    id: 'access.audit',
    page: 'access',
    title: 'Refusals and changes',
    icon: 'shield',
    keywords: ['audit', 'log', 'refused', 'denied', 'history', 'who changed'],
    scope: 'server',
    control: 'custom',
    visible: (env) => env.owner,
    render: () =>
      createElement(AuditList, { limit: AUDIT_LIMIT, profileId: null, title: 'Latest' }),
  },
];
