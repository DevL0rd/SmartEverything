import {
  USAGE_SOURCE,
  USAGE_SOURCE_LABELS,
  USAGE_WORK,
  USAGE_WORK_LABELS,
  type UsagePart,
  type UsageSplit,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Sql } from '../store/sql';
import { jsonText } from '../store/sql';

type Labeller = (sql: Sql, keys: readonly string[]) => ReadonlyMap<string, string>;

const NAMED = z.strictObject({ id: z.string(), name: z.string() });

function fromTable(table: string, column: string): Labeller {
  return (sql, keys) =>
    new Map(
      sql
        .all(
          NAMED,
          `select id, ${column} as name from ${table} where id in (select value from json_each($keys))`,
          { keys: jsonText(keys) },
        )
        .map((row) => [row.id, row.name]),
    );
}

function fromList<K extends string>(
  schema: z.ZodType<K>,
  labels: Readonly<Record<K, string>>,
): Labeller {
  return (_sql, keys) =>
    new Map(
      keys.flatMap((key) => {
        const parsed = schema.safeParse(key);
        return parsed.success ? [[key, labels[parsed.data]]] : [];
      }),
    );
}

const LABELLERS: Readonly<Record<UsageSplit, Labeller>> = {
  work: fromList(USAGE_WORK, USAGE_WORK_LABELS),
  source: fromList(USAGE_SOURCE, USAGE_SOURCE_LABELS),
  model: fromTable('ai_models', 'name'),
  profile: fromTable('profiles', 'name'),
  client: fromTable('clients', 'name'),
  chat: fromTable('ai_chats', 'title'),
  plugin: (_sql, keys) => new Map(keys.map((key) => [key, key])),
};

const GONE: Readonly<Record<UsageSplit, string>> = {
  work: 'Other work',
  source: 'Other provider',
  model: 'Retired model',
  profile: 'Removed person',
  client: 'Removed device',
  chat: 'Deleted chat',
  plugin: 'Removed plugin',
};

export function labelsOf(
  sql: Sql,
  split: UsageSplit,
  keys: readonly string[],
): (key: string) => string {
  const names = LABELLERS[split](sql, [...new Set(keys)]);
  return (key) => names.get(key) ?? GONE[split];
}

export function labelled(sql: Sql, split: UsageSplit, parts: readonly UsagePart[]): UsagePart[] {
  const label = labelsOf(
    sql,
    split,
    parts.map((part) => part.key),
  );
  return parts.map((part) => ({ ...part, label: label(part.key) }));
}
