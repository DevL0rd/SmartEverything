import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sendRecording } from '../src/server/recording-files';

let directory = '';
let server: Server;
let base = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-recording-files-'));
  const path = join(directory, 'clip.mp4');
  await writeFile(path, '0123456789');
  server = createServer((request, response) => {
    void sendRecording({ path, contentType: 'video/mp4' }, request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server has no port.');
  }
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  await rm(directory, { recursive: true, force: true });
});

async function get(range?: string): Promise<{ status: number; text: string; headers: Headers }> {
  const response = await fetch(base, range === undefined ? {} : { headers: { range } });
  return { status: response.status, text: await response.text(), headers: response.headers };
}

describe('sendRecording', () => {
  it('sends the whole file, announcing that ranges are accepted', async () => {
    const whole = await get();
    expect(whole.status).toBe(200);
    expect(whole.text).toBe('0123456789');
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(whole.headers.get('content-type')).toBe('video/mp4');
  });

  it('answers a byte range, a suffix range and an open-ended range with 206', async () => {
    const part = await get('bytes=2-4');
    expect([part.status, part.text, part.headers.get('content-range')]).toStrictEqual([
      206,
      '234',
      'bytes 2-4/10',
    ]);
    const suffix = await get('bytes=-3');
    expect([suffix.status, suffix.text, suffix.headers.get('content-range')]).toStrictEqual([
      206,
      '789',
      'bytes 7-9/10',
    ]);
    const open = await get('bytes=6-');
    expect([open.status, open.text, open.headers.get('content-range')]).toStrictEqual([
      206,
      '6789',
      'bytes 6-9/10',
    ]);
    const clamped = await get('bytes=8-99');
    expect([clamped.text, clamped.headers.get('content-range')]).toStrictEqual([
      '89',
      'bytes 8-9/10',
    ]);
  });

  it('answers a range that lies outside the file with 416 and the file size', async () => {
    const outside = await get('bytes=20-');
    expect(outside.status).toBe(416);
    expect(outside.headers.get('content-range')).toBe('bytes */10');
  });

  it('sends the whole file when the Range header is not a single byte range', async () => {
    expect((await get('lines=1-2')).text).toBe('0123456789');
    expect((await get('bytes=0-1,4-5')).status).toBe(200);
    expect((await get('bytes=x-y')).status).toBe(200);
  });
});
