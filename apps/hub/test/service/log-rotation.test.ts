import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LogRecord } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openLogFile } from '../../src/service/files';

const BIG = 'x'.repeat(1024 * 1024);

function record(event: string): LogRecord {
  return {
    timestamp: '2026-11-14T00:00:00.000Z',
    level: 'info',
    runtime: 'hub',
    scope: 'hub.service',
    event,
    payload: { filler: BIG },
  };
}

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'log-rotation-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('the running service log', () => {
  it('rotates while the service keeps running and keeps one older file', async () => {
    const path = join(folder, 'hub.log');
    const file = await openLogFile(path);
    for (let index = 0; index < 35; index += 1) file.sink(record(`event.${String(index)}`));
    await file.close();
    const current = (await stat(path)).size;
    const older = (await stat(`${path}.1`)).size;
    expect(current).toBeLessThan(12 * 1024 * 1024);
    expect(older).toBeLessThan(12 * 1024 * 1024);
    expect(await readFile(path, 'utf8')).toContain('event.34');
    expect(await readFile(`${path}.1`, 'utf8')).toContain('event.');
    await expect(stat(`${path}.2`)).rejects.toThrow();
  });
});
