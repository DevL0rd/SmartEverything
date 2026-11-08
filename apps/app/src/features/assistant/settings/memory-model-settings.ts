import { createElement } from 'react';
import type { SettingDefinition } from '../../../settings/types';
import { known, owner } from './assistant-write';
import { MemoryModelRow } from './memory-model-row';
import { ASSISTANT_GROUPS } from './settings-groups';

export const MEMORY_MODEL_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.memory-model',
    page: 'assistant',
    section: ASSISTANT_GROUPS.privacy,
    title: 'Memory manager model',
    description: 'Used after each AI turn to keep the memories tidy.',
    keywords: ['memory', 'manager', 'model', 'remember', 'learn'],
    scope: 'server',
    control: 'custom',
    row: true,
    visible: owner,
    when: known,
    render: () => createElement(MemoryModelRow),
  },
];
