import { StringDecoder } from 'node:string_decoder';
import type { Stream } from 'node:stream';
import { LOG_RECORD } from '@smarteverything/domain';
import {
  Logger,
  isEventName,
  isScope,
  shippedRecord,
  type LogRecord,
} from '@smarteverything/logging';
import { z } from 'zod';

const OUTPUT = z.object({
  ...LOG_RECORD.pick({
    timestamp: true,
    runtime: true,
    scope: true,
    event: true,
    level: true,
    payload: true,
    failure: true,
    durationMs: true,
  }).shape,
  runtime: z.literal('hub'),
  scope: LOG_RECORD.shape.scope.refine((scope) => scope.startsWith('hub.') && isScope(scope)),
  event: LOG_RECORD.shape.event.refine(isEventName),
});

export function followOutput(stream: Stream | null, sink: (line: string) => void): void {
  const decoder = new StringDecoder('utf8');
  let partial = '';
  stream?.on('data', (chunk: unknown) => {
    const text = partial + (Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk));
    const lines = text.split('\n');
    partial = lines.pop() ?? '';
    lines.forEach(sink);
  });
  stream?.once('end', () => {
    sink(partial + decoder.end());
    partial = '';
  });
}

function structuredOf(text: string): LogRecord | null {
  if (!text.startsWith('{')) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (cause) {
    if (cause instanceof SyntaxError) return null;
    throw cause;
  }
  const parsed = OUTPUT.safeParse(decoded);
  if (!parsed.success) return null;
  const { failure, durationMs, ...fields } = parsed.data;
  return {
    ...fields,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(failure === undefined
      ? {}
      : {
          failure: {
            name: failure.name,
            message: failure.message,
            ...(failure.stack === undefined ? {} : { stack: failure.stack }),
          },
        }),
  };
}

export interface OutputOrigin {
  readonly source: string;
  readonly scope: string;
  readonly event: string;
}

export function recordProcessOutput(
  origin: OutputOrigin,
  line: string,
  at: Date,
  structured = false,
): void {
  const text = line.trim();
  if (text === '') return;
  const record: LogRecord = (structured ? structuredOf(text) : null) ?? {
    timestamp: at.toISOString(),
    level: 'info',
    runtime: 'hub',
    scope: origin.scope,
    event: origin.event,
    payload: { line: text },
  };
  Logger.relay({ ...shippedRecord(record, 'server'), source: origin.source });
}
