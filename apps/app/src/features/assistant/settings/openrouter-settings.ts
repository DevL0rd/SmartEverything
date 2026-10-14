import { createElement } from 'react';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { OpenRouterSection } from './openrouter-section';

const BLOCK = 'assistant.openrouter';

const owner = (env: SettingEnv): boolean => env.owner;

function listed(
  id: string,
  title: string,
  keywords: readonly string[],
  visible?: (env: SettingEnv) => boolean,
): SettingDefinition {
  return {
    id: `${BLOCK}.${id}`,
    page: 'assistant',
    section: 'OpenRouter',
    title,
    keywords: ['openrouter', ...keywords],
    scope: 'server',
    control: 'listed',
    in: BLOCK,
    ...(visible === undefined ? {} : { visible }),
  };
}

export const OPENROUTER_SETTINGS: readonly SettingDefinition[] = [
  {
    id: BLOCK,
    page: 'assistant',
    title: 'OpenRouter',
    description: 'API key, credit and the default model for new chats.',
    keywords: ['openrouter', 'api key', 'credit', 'default model'],
    scope: 'server',
    control: 'custom',
    beforeSubPages: true,
    render: () => createElement(OpenRouterSection),
  },
  listed('key', 'Key status', ['api key', 'key added', 'no key yet', 'connected', 'models']),
  listed(
    'paste',
    'Paste or replace the key',
    ['api key', 'paste key', 'replace key', 'sk-or'],
    owner,
  ),
  listed('remove', 'Remove the key', ['api key', 'delete key', 'disconnect'], owner),
  listed('credit', 'Credit', ['balance', 'top up', 'buy credits', 'money left'], owner),
  listed('limit', 'This key’s limit', ['key limit', 'spending limit', 'remaining'], owner),
  listed('default', 'Default for new chats', ['default model', 'new chats', 'gemini', 'thinking']),
  listed('spent-today', 'Spent today with this key', ['spent', 'usage', 'cost', 'today'], owner),
  listed('spent-week', 'Spent this week with this key', ['spent', 'usage', 'cost', 'week'], owner),
  listed(
    'spent-month',
    'Spent this month with this key',
    ['spent', 'usage', 'cost', 'month'],
    owner,
  ),
];
