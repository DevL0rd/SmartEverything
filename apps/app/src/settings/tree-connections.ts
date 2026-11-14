import { isAccount } from '../features/connections/model/problems';
import { joinParts, plural } from '../format/text';
import { rowsOf, type StoreState } from '../store/state';
import type { SettingEnv, SettingsPageDefinition } from './types';

const ACCOUNTS_PAGE = 'connections';

const GOOGLE_PAGE = 'connections/google';

const ownerOnly = (env: SettingEnv): boolean => env.owner;

function accountsSummary(state: StoreState): string | null {
  const accounts = rowsOf(state.tables.provider_links).filter(isAccount).length;
  const google = rowsOf(state.tables.google_accounts).some((row) => row.status !== 'unlinked')
    ? 'Google'
    : null;
  const text = joinParts([accounts === 0 ? null : plural(accounts, 'device account'), google]);
  return text === '' ? null : text;
}

export const CONNECTION_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: ACCOUNTS_PAGE,
    title: 'Accounts',
    icon: 'link',
    parent: null,
    group: 'Connections',
    summary: accountsSummary,
    keywords: [
      'xiaomi',
      'tuya',
      'smart life',
      'smartthings',
      'providers',
      'integrations',
      'services',
      'google',
    ],
  },
  {
    id: 'connections/add',
    title: 'Add account',
    icon: 'plus',
    parent: ACCOUNTS_PAGE,
    group: null,
    keywords: ['provider'],
    visible: ownerOnly,
  },
  {
    id: GOOGLE_PAGE,
    title: 'Google',
    icon: 'link',
    parent: ACCOUNTS_PAGE,
    group: null,
    keywords: [
      'google account',
      'google calendar',
      'google tasks',
      'calendar sync',
      'tasks sync',
      'sync now',
      'sync log',
      'link google',
      'unlink google',
      'client id',
      'oauth',
    ],
  },
];
