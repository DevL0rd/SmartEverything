import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { env, platform } from 'node:process';
import { promisify } from 'node:util';
import { clip, type LogRecord } from '@smarteverything/logging';
import { z } from 'zod';

const run = promisify(execFile);
const PAGE_SIZE = 24;
const CURSOR = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[a-zA-Z0-9;=:_-]+$/u);
const INVOCATION = z.string().regex(/^[a-f0-9]{32}$/u);
const ENTRY = z.object({
  __CURSOR: CURSOR,
  __REALTIME_TIMESTAMP: z.string().regex(/^\d{1,16}$/u),
  _SYSTEMD_USER_UNIT: z.string(),
  _SYSTEMD_INVOCATION_ID: INVOCATION,
  PRIORITY: z.unknown(),
  MESSAGE: z.unknown(),
});

const START_FAILURE =
  /^\[\d\d:\d\d:\d\d\]-\[EXCEPTION\]-\[hub\.service\]: service\.start_failed\b/u;
const NODE_FAILURE = /^(?:Error|[A-Z][a-zA-Z]+Error)(?: \[ERR_[A-Z_]+\])?: /u;

export interface StartupJournal {
  readonly cursor: string;
  readonly records: readonly LogRecord[];
  readonly more: boolean;
}

function errorMessageOf(message: unknown, priority: unknown): string | null {
  if (typeof message !== 'string' || message.trim() === '') return null;
  const errorPriority = typeof priority === 'string' && /^[0-3]$/u.test(priority);
  return errorPriority || START_FAILURE.test(message) || NODE_FAILURE.test(message)
    ? clip(message, 1000)
    : null;
}

export function parseStartupJournal(
  output: string,
  unit: string,
  invocation: string,
): StartupJournal | null {
  const records: LogRecord[] = [];
  let cursor: string | null = null;
  const lines = output.trimEnd().split('\n').filter(Boolean);
  for (const line of lines.slice(0, PAGE_SIZE)) {
    const result = ENTRY.safeParse(JSON.parse(line));
    if (!result.success) continue;
    const entry = result.data;
    if (entry._SYSTEMD_USER_UNIT !== unit || entry._SYSTEMD_INVOCATION_ID === invocation) continue;
    cursor = entry.__CURSOR;
    const message = errorMessageOf(entry.MESSAGE, entry.PRIORITY);
    if (message === null) continue;
    records.push({
      timestamp: new Date(Number(entry.__REALTIME_TIMESTAMP) / 1000).toISOString(),
      runtime: 'hub',
      platform: 'server',
      scope: 'hub.startup-journal',
      event: 'service.previous_error',
      level: 'error',
      payload: {
        unit,
        entry: createHash('sha256').update(cursor).digest('hex').slice(0, 20),
      },
      failure: { name: 'ServiceJournalError', message },
    });
  }
  return cursor === null ? null : { cursor, records, more: lines.length > PAGE_SIZE };
}

export async function readStartupJournal(
  unit: string,
  cursor: unknown,
): Promise<StartupJournal | null> {
  const invocation = INVOCATION.safeParse(env['INVOCATION_ID']);
  if (platform !== 'linux' || !invocation.success) return null;
  const previous = CURSOR.safeParse(cursor);
  const { stdout } = await run(
    'journalctl',
    [
      '--user',
      '--no-pager',
      '--output=json',
      '--output-fields=_SYSTEMD_USER_UNIT,_SYSTEMD_INVOCATION_ID,PRIORITY,MESSAGE',
      '--since=-24h',
      `--lines=+${String(PAGE_SIZE + 1)}`,
      ...(previous.success ? [`--after-cursor=${previous.data}`] : []),
      `_SYSTEMD_USER_UNIT=${unit}`,
    ],
    { encoding: 'utf8', timeout: 2000, maxBuffer: 512 * 1024 },
  );
  return parseStartupJournal(stdout, unit, invocation.data);
}
