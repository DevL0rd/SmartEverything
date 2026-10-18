import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, isEventName, type LogRecord } from '@smarteverything/logging';
import { failureFacts, noteRequest, pathShape, safeText } from './request-log';

const CALL = /\blog\.(?:trace|debug|info|warn|error|exception)\(\s*'([^']+)'/g;
const CONDITIONAL = /\blog\[[^\]]*\]\(\s*'([^']+)'/g;
const TIMED = /\btimed\(\s*'([^']+)'/g;
const COUNTED = /countedListener\(\s*'([^']+)'/g;

function sources(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => readFileSync(join(directory, name), 'utf8'));
}

describe('api logging event names', () => {
  it('uses only valid event names in the api connection layer', () => {
    const names: string[] = [];
    for (const text of sources(__dirname)) {
      for (const match of text.matchAll(CALL)) names.push(match[1] ?? '');
      for (const match of text.matchAll(CONDITIONAL)) names.push(match[1] ?? '');
    }
    expect(names.length).toBeGreaterThan(50);
    expect(names.filter((name) => !isEventName(name))).toEqual([]);
  });

  it('uses valid stems for the native module wrappers', () => {
    const text = readFileSync(
      join(__dirname, '../../../modules/health-connect/src/hub-network.ts'),
      'utf8',
    );
    const stems = [...text.matchAll(TIMED), ...text.matchAll(COUNTED)].map((m) => m[1] ?? '');
    expect(stems.length).toBeGreaterThan(10);
    const names = stems.flatMap((stem) => [
      `${stem}.started`,
      `${stem}.finished`,
      `${stem}.failed`,
      `${stem}.received`,
    ]);
    expect(names.filter((name) => !isEventName(name))).toEqual([]);
  });
});

describe('request logging', () => {
  const records: LogRecord[] = [];

  beforeEach(() => {
    records.length = 0;
    Logger.configure({ level: 'trace', sink: (record) => records.push(record) });
  });

  afterEach(() => {
    Logger.reset();
    vi.restoreAllMocks();
  });

  const base = {
    route: 'GET /api/devices',
    method: 'GET',
    routeKind: 'lan',
    generation: 3,
    scopeId: 'abcdef0123456789',
    status: 200,
    elapsedMs: 12,
    waitedMs: 0,
  };

  it('logs a success at trace with the scope shortened', () => {
    noteRequest(base);
    const record = records.find((entry) => entry.event === 'api.request_done');
    expect(record?.payload).toMatchObject({ route: 'GET /api/devices', scopeId: 'abcdef01' });
  });

  it('warns on a failure with the cause and counts the attempt', () => {
    const error = new TypeError('Network request failed for https://10.0.0.5:8443/api?token=abc');
    noteRequest({ ...base, status: null, error });
    noteRequest({ ...base, status: null, error });
    const failures = records.filter((entry) => entry.event === 'api.request_failed');
    expect(failures).toHaveLength(2);
    expect(failures[1]?.payload).toMatchObject({ attempt: 2, errorName: 'TypeError' });
    expect(JSON.stringify(failures[0]?.payload)).not.toContain('10.0.0.5');
  });

  it('records a caller abort as a cancellation, not a failure', () => {
    const controller = new AbortController();
    controller.abort(new Error('screen left'));
    noteRequest({ ...base, status: null, error: new Error('x'), signal: controller.signal });
    expect(records.some((entry) => entry.event === 'api.request_cancelled')).toBe(true);
    expect(records.some((entry) => entry.event === 'api.request_failed')).toBe(false);
  });

  it('keeps url shapes free of hosts and queries', () => {
    expect(pathShape('https://192.168.1.4:8443/api/devices/abc?x=1')).toBe('/api/devices/abc');
    expect(pathShape('nonsense')).toBe('unparsable');
    expect(safeText('see https://host.example/path?token=1 now')).not.toContain('host.example');
    expect(failureFacts('boom')).toEqual({ errorName: 'string', cause: 'not an Error' });
  });
});
