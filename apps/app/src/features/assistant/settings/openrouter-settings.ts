import { createElement, type ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { CreditRow, KeyLimitRow, KeySpendRow } from './openrouter-credits';
import { DefaultModelRow } from './default-model-row';
import {
  ImportKeyRow,
  KEY_PAGE,
  KeyRow,
  KeyStatusRow,
  PasteKeyRow,
  RemoveKeyRow,
} from './openrouter-key';
import { MODELS_PAGE } from './openrouter-models-screen';

const PAGE = 'assistant/openrouter';

const owner = (env: SettingEnv): boolean => env.owner;

interface RowEntry {
  readonly id: string;
  readonly page: string;
  readonly section?: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly ownerOnly?: boolean;
  readonly render: () => ReactNode;
}

const ROWS: readonly RowEntry[] = [
  {
    id: 'default',
    page: PAGE,
    title: 'Default for new chats',
    keywords: ['default model', 'new chats', 'gemini', 'thinking'],
    render: () => createElement(DefaultModelRow, { backend: 'openrouter' }),
  },
  {
    id: 'key',
    page: PAGE,
    title: 'API key',
    keywords: ['api key', 'paste', 'discordinator', 'sk-or'],
    render: () => createElement(KeyRow),
  },
  {
    id: 'credit',
    page: PAGE,
    title: 'Credit',
    keywords: ['balance', 'top up', 'buy credits'],
    ownerOnly: true,
    render: () => createElement(CreditRow),
  },
  {
    id: 'key.status',
    page: KEY_PAGE,
    title: 'OpenRouter key',
    keywords: ['api key', 'status'],
    render: () => createElement(KeyStatusRow),
  },
  {
    id: 'key.import',
    page: KEY_PAGE,
    title: 'Use the key from Discordinator',
    keywords: ['import', 'discordinator'],
    ownerOnly: true,
    render: () => createElement(ImportKeyRow),
  },
  {
    id: 'key.paste',
    page: KEY_PAGE,
    title: 'Paste a key',
    keywords: ['paste', 'replace key'],
    ownerOnly: true,
    render: () => createElement(PasteKeyRow),
  },
  {
    id: 'key.remove',
    page: KEY_PAGE,
    title: 'Remove the key',
    keywords: ['remove key', 'delete key'],
    ownerOnly: true,
    render: () => createElement(RemoveKeyRow),
  },
  {
    id: 'key.today',
    page: KEY_PAGE,
    section: 'Spent with this key',
    title: 'Today',
    keywords: ['key usage'],
    ownerOnly: true,
    render: () => createElement(KeySpendRow, { title: 'Today', field: 'usage_daily' }),
  },
  {
    id: 'key.week',
    page: KEY_PAGE,
    section: 'Spent with this key',
    title: 'This week',
    keywords: ['key usage'],
    ownerOnly: true,
    render: () => createElement(KeySpendRow, { title: 'This week', field: 'usage_weekly' }),
  },
  {
    id: 'key.month',
    page: KEY_PAGE,
    section: 'Spent with this key',
    title: 'This month',
    keywords: ['key usage'],
    ownerOnly: true,
    render: () => createElement(KeySpendRow, { title: 'This month', field: 'usage_monthly' }),
  },
  {
    id: 'key.limit',
    page: KEY_PAGE,
    section: 'Spent with this key',
    title: 'This key’s limit',
    keywords: ['key limit', 'resets'],
    ownerOnly: true,
    render: () => createElement(KeyLimitRow),
  },
];

export const OPENROUTER_SETTINGS: readonly SettingDefinition[] = [
  ...ROWS.map((row): SettingDefinition => ({
    id: `assistant.openrouter.${row.id}`,
    page: row.page,
    ...(row.section === undefined ? {} : { section: row.section }),
    title: row.title,
    keywords: row.keywords,
    scope: 'server',
    control: 'custom',
    row: true,
    ...(row.ownerOnly === true ? { visible: owner } : {}),
    render: row.render,
  })),
  {
    id: 'assistant.openrouter.models',
    page: PAGE,
    title: 'Models',
    icon: 'list',
    keywords: ['catalogue', 'models', 'prices', 'favourites', 'refresh', 'providers'],
    scope: 'server',
    control: 'link',
    href: href.settings.page(MODELS_PAGE),
  },
  {
    id: 'assistant.openrouter.costs',
    page: PAGE,
    title: 'Costs',
    icon: 'trendUp',
    keywords: ['cost', 'spend', 'usage', 'tokens', 'budget'],
    scope: 'server',
    control: 'link',
    href: href.assistantCosts(),
  },
];
