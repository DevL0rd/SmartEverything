import type { SettingDefinition } from '../../../settings/types';
export const EXTENSION_UPDATE_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.skills.automatic-updates',
    page: 'assistant/skills/updates',
    title: 'Automatic updates',
    keywords: ['skills', 'Anthropic', 'automatic', 'updates', 'keep up to date'],
    scope: 'server',
    control: 'listed',
    in: 'assistant.skills.automatic-updates',
  },
  {
    id: 'assistant.skills.update-now',
    page: 'assistant/skills/updates',
    title: 'Update now',
    keywords: ['skills', 'Anthropic', 'update', 'refresh', 'manual'],
    scope: 'server',
    control: 'listed',
    in: 'assistant.skills.update-now',
  },
];
