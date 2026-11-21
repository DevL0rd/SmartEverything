import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIVE_MESSAGE } from '@smarteverything/domain';
import type { LogRecord } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openLogFile, type LogFile } from '../../src/service/files';
import { LogLines } from '../../src/service/log-lines';

function record(event: string): LogRecord {
  return {
    timestamp: '2026-11-14T00:00:00.000Z',
    level: 'info',
    runtime: 'hub',
    scope: 'hub.service',
    event,
    payload: {},
  };
}

async function settled(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

let folder: string;
let file: LogFile;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'log-lines-'));
  file = await openLogFile(join(folder, 'hub.log'), (cause) => {
    throw cause;
  });
});

afterEach(async () => {
  await file.close();
  await rm(folder, { recursive: true, force: true });
});

describe('the service log lines', () => {
  it('hands every listener one batch per burst and never an empty one', async () => {
    const batches: (readonly string[])[] = [];
    file.lines.listen((lines) => {
      batches.push(lines);
    });
    file.sink(record('service.started'));
    file.sink(record('service.ready'));
    await settled();
    file.sink(record('service.idle'));
    await settled();
    expect(batches.map((lines) => lines.length)).toEqual([2, 1]);
    expect(batches[0]?.[1]).toContain('service.ready');
  });

  it('only sends service log notices the live schema accepts', async () => {
    const notices: unknown[] = [];
    file.lines.listen((lines) => {
      notices.push({ type: 'service_log', lines: [...lines] });
    });
    for (const event of ['a', 'b', 'c']) {
      file.sink(record(event));
      await settled();
    }
    expect(notices).toHaveLength(3);
    for (const notice of notices) {
      expect(LIVE_MESSAGE.safeParse(notice).success).toBe(true);
    }
  });

  it('keeps nothing while nobody listens', async () => {
    const lines = new LogLines();
    lines.write('before');
    const batches: (readonly string[])[] = [];
    lines.listen((written) => {
      batches.push(written);
    });
    lines.write('after');
    await settled();
    expect(batches).toEqual([['after']]);
  });
});
