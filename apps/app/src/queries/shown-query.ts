import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import type { z } from 'zod';

const log = new Logger('app.queries');

export interface ShownQueryWrite<T, R> {
  readonly event: string;
  readonly key: QueryKey;
  readonly schema: z.ZodType<T>;
  readonly change: (value: T) => T;
  readonly send: () => Promise<R>;
}

export async function writeShownQuery<T, R>(
  client: QueryClient,
  write: ShownQueryWrite<T, R>,
): Promise<R> {
  await client.cancelQueries({ queryKey: write.key, exact: true });
  const before = write.schema.safeParse(client.getQueryData(write.key));
  const operation = log.operation(write.event, { optimistic: before.success });
  if (before.success) client.setQueryData(write.key, write.change(before.data));
  try {
    const answer = await write.send();
    operation.succeeded();
    return answer;
  } catch (error) {
    operation.failed(error, { rolledBack: before.success });
    if (before.success) client.setQueryData(write.key, before.data);
    throw error;
  }
}

export interface ShownTarget {
  readonly prefix: QueryKey;
  readonly edit: (value: unknown) => unknown;
}

export function shownTarget<T>(
  prefix: QueryKey,
  schema: z.ZodType<T>,
  change: (value: T) => T,
): ShownTarget {
  return {
    prefix,
    edit: (value): unknown => {
      const parsed = schema.safeParse(value);
      if (!parsed.success) return value;
      const next = change(parsed.data);
      return next === parsed.data ? value : next;
    },
  };
}

export interface ShownQueriesWrite<R> {
  readonly event: string;
  readonly targets: readonly ShownTarget[];
  readonly send: () => Promise<R>;
}

interface Before {
  readonly key: QueryKey;
  readonly value: unknown;
}

export function showTargets(
  client: QueryClient,
  targets: readonly ShownTarget[],
): readonly Before[] {
  const before: Before[] = [];
  for (const target of targets) {
    for (const [key, value] of client.getQueriesData({ queryKey: target.prefix })) {
      if (value === undefined) continue;
      const after = target.edit(value);
      if (after === value) continue;
      client.setQueryData(key, after);
      before.push({ key, value });
    }
  }
  return before;
}

export async function writeShownQueries<R>(
  client: QueryClient,
  write: ShownQueriesWrite<R>,
): Promise<R> {
  await Promise.all(
    write.targets.map((target) => client.cancelQueries({ queryKey: target.prefix })),
  );
  const before = showTargets(client, write.targets);
  const operation = log.operation(write.event, { optimistic: before.length > 0 });
  try {
    const answer = await write.send();
    operation.succeeded();
    return answer;
  } catch (error) {
    operation.failed(error, { rolledBack: before.length });
    for (const { key, value } of [...before].reverse()) client.setQueryData(key, value);
    throw error;
  }
}
