import { createElement } from 'react';
import type { SettingDefinition } from '../../../settings/types';
import { ClearHistoryRow } from './clear-history-row';

export const PRIVACY_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.clear',
    page: 'assistant/privacy',
    title: 'Clear chat history',
    keywords: ['delete', 'history', 'privacy', 'messages', 'clear all chats', 'attachments'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(ClearHistoryRow),
  },
];
