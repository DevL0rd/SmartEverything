import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TrafficCapture } from '../../../src/plugins/builtin/aibi/capture';
import { ok } from '../../../src/plugins/builtin/aibi/replies';

const RECORD = z.object({
  scheme: z.string(),
  request: z.object({
    startLine: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.string(),
  }),
  response: z.object({
    startLine: z.string(),
    headers: z.record(z.string(), z.string()),
    bytes: z.number(),
    body: z.string(),
  }),
});

let folder = '';

afterEach(async (): Promise<void> => {
  await rm(folder, { recursive: true, force: true });
});

describe('AIBI traffic capture', () => {
  it('records the request and the reply in the same shape as the raw capture', async () => {
    folder = await mkdtemp(join(tmpdir(), 'aibi-capture-'));
    const capture = new TrafficCapture({
      enabled: true,
      directory: folder,
      failed: (): void => undefined,
    });
    capture.record({
      scheme: 'http',
      remote: '192.168.50.9',
      started: new Date(),
      request: {
        startLine: 'POST /aibi/report/status HTTP/1.1',
        headers: { 'content-type': 'application/json', secret: 'hidden' },
        body: Buffer.from('{"email":"a@b.c","battery":80}'),
      },
      response: ok({ errcode: 0 }),
    });
    await capture.flushed();
    const [file = ''] = await readdir(folder);
    const record = RECORD.parse(JSON.parse(await readFile(join(folder, file), 'utf8')));
    expect(record.request.startLine).toBe('POST /aibi/report/status HTTP/1.1');
    expect(record.request.headers['secret']).toBe('[redacted]');
    expect(record.request.body).toBe('{"email":"[redacted]","battery":80}');
    expect(record.response.startLine).toBe('HTTP/1.1 200 OK');
    expect(record.response.headers).toStrictEqual({
      'content-type': 'application/json; charset=utf-8',
      'content-length': '13',
    });
    expect(record.response.body).toBe('{"errcode":0}');
  });
});
