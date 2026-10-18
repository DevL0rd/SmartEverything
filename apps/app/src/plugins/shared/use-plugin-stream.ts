import { pluginStreamKey, type PluginId, type PluginStreamRow } from '@smarteverything/domain';
import { useEffect, useMemo, useRef } from 'react';
import type { z } from 'zod';
import { useStoreSelector } from '../../store/store-context';
import { pluginStreamRow } from '../../store/subscriptions';
import { LogTally } from '../../design/log-tally';
import { pluginLog } from './plugin-log';

const rowTally = new LogTally(pluginLog, 'plugin_stream.summary', 10_000);

export type PluginStream<T> =
  | { readonly state: 'waiting' }
  | { readonly state: 'invalid'; readonly reason: string }
  | { readonly state: 'ready'; readonly value: T; readonly at: string };

const WAITING = { state: 'waiting' } as const;

function issuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (text, key) =>
      typeof key === 'number' ? `${text}[]` : text === '' ? String(key) : `${text}.${String(key)}`,
    '',
  );
}

function streamProblem(error: z.ZodError): string {
  const counts = new Map<string, number>();
  for (const issue of error.issues) {
    const path = issuePath(issue.path);
    const line = path === '' ? issue.message : `${issue.message} at ${path}`;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return Array.from(counts, ([line, count]) =>
    count === 1 ? line : `${line} (${String(count)}×)`,
  ).join('\n');
}

export class StreamParser<T> {
  private readonly parsed = new WeakMap<object, PluginStream<T>>();

  private readonly byValue = new WeakMap<object, PluginStream<T>>();

  constructor(private readonly schema: z.ZodType<T>) {}

  private parsedValue(value: PluginStreamRow['value']): PluginStream<T> | undefined {
    return typeof value === 'object' && value !== null ? this.byValue.get(value) : undefined;
  }

  private parse(row: PluginStreamRow): PluginStream<T> {
    const result = this.schema.safeParse(row.value);
    return result.success
      ? { state: 'ready', value: result.data, at: row.at }
      : { state: 'invalid', reason: streamProblem(result.error) };
  }

  read(row: PluginStreamRow | undefined): PluginStream<T> {
    if (row === undefined) return WAITING;
    const known = this.parsed.get(row);
    if (known !== undefined) return known;
    const sameValue = this.parsedValue(row.value);
    const stream = sameValue === undefined ? this.parse(row) : { ...sameValue, at: row.at };
    this.parsed.set(row, stream);
    if (typeof row.value === 'object' && row.value !== null) this.byValue.set(row.value, stream);
    return stream;
  }
}

export function usePluginStream<T>(
  pluginId: PluginId,
  stream: string,
  source: z.ZodType<T> | StreamParser<T>,
  enabled = true,
): PluginStream<T> {
  const key = pluginStreamKey(pluginId, stream);
  const row = useStoreSelector(
    (state) => (enabled ? pluginStreamRow(state, key) : undefined),
    Object.is,
    [key, enabled],
  );
  const parser = useMemo(
    () => (source instanceof StreamParser ? source : new StreamParser(source)),
    [source],
  );
  const value = parser.read(row);
  useStreamTrace({ pluginId, stream, enabled, row, value });
  return value;
}

function useStreamTrace<T>({
  pluginId,
  stream,
  enabled,
  row,
  value,
}: {
  readonly pluginId: PluginId;
  readonly stream: string;
  readonly enabled: boolean;
  readonly row: PluginStreamRow | undefined;
  readonly value: PluginStream<T>;
}): void {
  const previous = useRef<PluginStream<T>['state'] | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    pluginLog.info('plugin_stream.subscribed', { pluginId, stream });
    return (): void => {
      pluginLog.info('plugin_stream.unsubscribed', { pluginId, stream });
      previous.current = null;
    };
  }, [pluginId, stream, enabled]);
  useEffect(() => {
    if (!enabled) return;
    rowTally.bump(`${pluginId}/${stream}`);
  }, [row, enabled, pluginId, stream]);
  const state = value.state;
  const reason = value.state === 'invalid' ? value.reason : '';
  useEffect(() => {
    if (!enabled || previous.current === state) return;
    const from = previous.current;
    previous.current = state;
    if (state === 'invalid') {
      pluginLog.warn('plugin_stream.invalid', {
        pluginId,
        stream,
        from,
        reason: reason.slice(0, 300),
      });
      return;
    }
    pluginLog.info('plugin_stream.state_changed', { pluginId, stream, from, to: state });
  }, [enabled, state, reason, pluginId, stream]);
}
