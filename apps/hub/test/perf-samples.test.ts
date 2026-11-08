import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../src/data-layout';
import { PerfSamples, type PerfRecord } from '../src/client-failures/perf-samples';
import { testLogger } from './support/logs';

const PERF_LINE = z.object({ message: z.string() });

function record(message: string): PerfRecord {
  return {
    at: '2026-10-11T05:00:00.000Z',
    clientId: 'c1',
    client: 'Phone',
    platform: 'android',
    release: '0.1.0',
    screen: 'devices/index',
    message,
  };
}

let directory = '';
let file = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'perf-samples-'));
  file = hubLayout(directory, {}).system.logs.perfSamples;
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('PerfSamples', () => {
  it('appends one JSON line per record in order', async () => {
    const samples = new PerfSamples(file, testLogger('perf'));
    samples.append(record('a'));
    samples.append(record('b'));
    await samples.flushed();
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    expect(lines.map((line) => PERF_LINE.parse(JSON.parse(line)).message)).toEqual(['a', 'b']);
  });

  it('rotates to the previous file when the cap would be passed', async () => {
    const samples = new PerfSamples(file, testLogger('perf'), 300);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${'x'.repeat(280)}\n`);
    samples.append(record('after'));
    await samples.flushed();
    expect(await readFile(`${file}.1`, 'utf8')).toContain('xxxx');
    const current = await readFile(file, 'utf8');
    expect(current.trim().split('\n')).toHaveLength(1);
    expect(current).toContain('after');
  });
});
