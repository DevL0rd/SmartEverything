import { PUSH_RELEASES_SETTINGS_PAGE } from '../../app-shell/hrefs';
import type { SettingDefinition, SettingEnv } from '../../settings/types';

export const PUSH_RELEASES_PAGE = PUSH_RELEASES_SETTINGS_PAGE;
export const PUSH_SETUP_SETTING = 'hub-updates.push-setup';
export const PUSHED_REVISIONS_SETTING = 'hub-updates.pushed-revisions';

const ownerOnly = (env: SettingEnv): boolean => env.owner;

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: PUSH_SETUP_SETTING,
    page: PUSH_RELEASES_PAGE,
    title: 'GitHub push webhook',
    description: 'Set up the webhook that releases every push to the update branch',
    keywords: ['webhook', 'github', 'secret', 'push', 'setup', 'configure update source', 'nas'],
    scope: 'server',
    control: 'listed',
    in: PUSH_SETUP_SETTING,
    visible: ownerOnly,
  },
  {
    id: PUSHED_REVISIONS_SETTING,
    page: PUSH_RELEASES_PAGE,
    title: 'Pushed revisions',
    description: 'Each pushed commit with its release note and the progress of every release step',
    keywords: [
      'revisions',
      'commits',
      'release history',
      'pipeline',
      'progress',
      'failed release',
      'rolled back',
      'superseded',
    ],
    scope: 'server',
    control: 'listed',
    in: PUSHED_REVISIONS_SETTING,
    visible: ownerOnly,
  },
];
