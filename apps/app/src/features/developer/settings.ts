import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { DEVELOPER_TOGGLES } from '../../developer/toggles';
import { DeveloperToggleRow, ReloadRow } from './components/developer-rows';

const TOGGLE_SETTINGS: readonly SettingDefinition[] = DEVELOPER_TOGGLES.map((toggle) => ({
  id: `developer.${toggle.id}`,
  page: 'developer',
  section: toggle.section,
  title: toggle.label,
  description: toggle.description,
  keywords: ['developer', 'debug', ...toggle.keywords],
  scope: 'device',
  control: 'custom',
  row: true,
  ...(toggle.release ? {} : { visible: () => __DEV__ }),
  render: () => createElement(DeveloperToggleRow, { id: toggle.id }),
}));

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'developer.reload',
    page: 'developer',
    section: 'Apply',
    title: 'Reload app',
    keywords: ['reload', 'restart', 'refresh', 'developer', 'debug'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: () => __DEV__,
    render: () => createElement(ReloadRow),
  },
  ...TOGGLE_SETTINGS,
];
