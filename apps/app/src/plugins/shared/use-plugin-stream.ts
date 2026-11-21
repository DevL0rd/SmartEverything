import { pluginStreamKey, type PluginId, type PluginStreamRow } from '@smarteverything/domain';
import { useEffect, useMemo, useRef } from 'react';
import type { z } from 'zod';
import { useStoreSelector } from '../../store/store-context';
import { pluginStreamRow } from '../../store/subscriptions';
import { sectionFailureOf } from '../../store/selectors';
import type { SectionFailure } from '../../store/state';
import { LogTally } from '../../design/log-tally';
import { pluginLog } from './plugin-log';

const rowTally = new LogTally(pluginLog, 'plugin_stream.summary', 10_000);

export type PluginStream<T> =
  | { readonly state: 'waiting' }
  | { readonly state: 'invalid'; readonly reason: string }
  | { readonly state: 'ready'; readonly value: T; readonly at: string };

const WAITING = { state: 'waiting' } as const;

export const PLUGIN_STREAMS_SECTION = 'tables.plugin_streams';

export function unreadableStream(failure: SectionFailure): {
  readonly state: 'invalid';
  readonly reason: string;
} {
  return {
    state: 'invalid',
    reason: `This app can’t read plugin streams from your server: ${failure.reason}. Update the app.`,
  };
}

const unreadableByFailure = new WeakMap<SectionFailure, ReturnType<typeof unreadableStream>>();

function unreadableOf(failure: SectionFailure): ReturnType<typeof unreadableStream> {
  const known = unreadableByFailure.get(failure);
  if (known !== undefined) return known;
  const stream = unreadableStream(failure);
  unreadableByFailure.set(failure, stream);
  return stream;
}

type StreamInput = readonly [PluginStreamRow | undefined, SectionFailure | null];

const NO_INPUT: StreamInput = [undefined, null];

function sameInput(left: StreamInput, right: StreamInput): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

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
  const [row, failure] = useStoreSelector(
    (state): StreamInput =>
      enabled
        ? [pluginStreamRow(state, key), sectionFailureOf(state.sync, PLUGIN_STREAMS_SECTION)]
        : NO_INPUT,
    sameInput,
    [key, enabled],
  );
  const parser = useMemo(
    () => (source instanceof StreamParser ? source : new StreamParser(source)),
    [source],
  );
  const value = failure === null ? parser.read(row) : unreadableOf(failure);
  useStreamTrace({ pluginId, stream, enabled, row, value });
  return value;
}

interface StreamSeen {
  readonly row: PluginStreamRow | undefined;
  readonly state: PluginStream<unknown>['state'];
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
  const previous = useRef<StreamSeen | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    pluginLog.info('plugin_stream.subscribed', { pluginId, stream });
    return (): void => {
      pluginLog.info('plugin_stream.unsubscribed', { pluginId, stream });
      previous.current = null;
    };
  }, [pluginId, stream, enabled]);
  const state = value.state;
  const reason = value.state === 'invalid' ? value.reason : '';
  useEffect(() => {
    if (!enabled) return;
    const last = previous.current;
    previous.current = { row, state };
    if (last === null || last.row !== row) rowTally.bump(`${pluginId}/${stream}`);
    if (last !== null && last.state === state) return;
    const from = last === null ? null : last.state;
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
  }, [enabled, row, state, reason, pluginId, stream]);
}
