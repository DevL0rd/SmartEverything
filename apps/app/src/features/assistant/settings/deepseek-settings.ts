import { createElement } from 'react';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { DeepSeekSection } from './deepseek-section';

const BLOCK = 'assistant.deepseek';

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
    section: 'DeepSeek key',
    title,
    keywords: ['deepseek', ...keywords],
    scope: 'server',
    control: 'listed',
    in: BLOCK,
    ...(visible === undefined ? {} : { visible }),
  };
}

export const DEEPSEEK_SETTINGS: readonly SettingDefinition[] = [
  {
    id: BLOCK,
    page: 'assistant',
    title: 'DeepSeek',
    description: 'The key that lets the assistant use DeepSeek models.',
    keywords: ['deepseek', 'api key', 'models'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(DeepSeekSection),
  },
  listed('key', 'DeepSeek key status', ['api key', 'key added', 'no key yet', 'models']),
  listed('paste', 'Paste or replace the DeepSeek key', ['api key', 'paste key', 'sk-'], owner),
  listed('remove', 'Remove the DeepSeek key', ['api key', 'delete key', 'disconnect'], owner),
];
