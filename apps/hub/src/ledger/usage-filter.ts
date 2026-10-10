import type { UsageFilter, UsageSplit } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { jsonText } from '../store/sql';

export interface Where {
  readonly text: string;
  readonly parameters: Readonly<Record<string, SQLInputValue>>;
}

export const SPLIT_COLUMNS: Readonly<Record<UsageSplit, string>> = {
  work: 'work',
  source: 'source',
  model: 'model_id',
  profile: 'profile_id',
  client: 'client_id',
  chat: 'chat_id',
  plugin: 'plugin_id',
};

const LIST_KEYS = ['profileIds', 'clientIds', 'works', 'sources', 'modelIds'] as const;

type ListKey = (typeof LIST_KEYS)[number];

const ONE_KEYS = ['chatId', 'messageId', 'pluginId'] as const;

type OneKey = (typeof ONE_KEYS)[number];

const LIST_COLUMNS: Readonly<Record<ListKey, string>> = {
  profileIds: 'profile_id',
  clientIds: 'client_id',
  works: 'work',
  sources: 'source',
  modelIds: 'model_id',
};

const ONE_COLUMNS: Readonly<Record<OneKey, string>> = {
  chatId: 'chat_id',
  messageId: 'message_id',
  pluginId: 'plugin_id',
};

function listClauses(filter: UsageFilter): Where[] {
  return LIST_KEYS.flatMap((key) => {
    const values = filter[key];
    return values === undefined
      ? []
      : [
          {
            text: `${LIST_COLUMNS[key]} in (select value from json_each($${key}))`,
            parameters: { [key]: jsonText(values) },
          },
        ];
  });
}

function singleClauses(filter: UsageFilter): Where[] {
  return ONE_KEYS.flatMap((key) => {
    const value = filter[key];
    return value === undefined
      ? []
      : [{ text: `${ONE_COLUMNS[key]} = $${key}`, parameters: { [key]: value } }];
  });
}

export function whereOf(filter: UsageFilter): Where {
  const window: Where = {
    text: 'at >= $from and at < $to',
    parameters: {
      from: new Date(filter.from).toISOString(),
      to: new Date(filter.to).toISOString(),
    },
  };
  const clauses = [window, ...listClauses(filter), ...singleClauses(filter)];
  return {
    text: clauses.map((clause) => clause.text).join(' and '),
    parameters: clauses.reduce<Record<string, SQLInputValue>>(
      (all, clause) => ({ ...all, ...clause.parameters }),
      {},
    ),
  };
}
