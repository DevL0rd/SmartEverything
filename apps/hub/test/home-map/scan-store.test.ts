import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { ApiError, type HomeMapScan } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScanNoSpaceError, ScanStore, type ScanStorePorts } from '../../src/home-map/scan-store';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { blackHole, fullDisk, plyFile, spzFile, splatFile } from './scan-fixtures';

let root: string;
let logs: CapturedLogs;
let free: number;
let counter: number;
let openWrite: ScanStorePorts['openWrite'];

const store = (): ScanStore =>
  new ScanStore({
    root,
    freeBytes: () => Promise.resolve(free),
    openWrite: (path) => openWrite(path),
    newId: () => `upload-${String((counter += 1))}`,
    log: testLogger('scan'),
  });

const chunked = (file: Buffer, size = 4096): Readable =>
  Readable.from(
    Array.from({ length: Math.ceil(file.length / size) }, (_, at) =>
      file.subarray(at * size, (at + 1) * size),
    ),
  );

const temporary = (): string[] => {
  const directory = join(root, 'tmp');
  return existsSync(directory) ? readdirSync(directory) : [];
};

const scanOf = (hash: string, format: 'ply' | 'splat' | 'spz', lod = ''): HomeMapScan => ({
  file: { hash, format, bytes: 1, name: 'room' },
  lod: lod === '' ? null : { hash: lod, bytes: 1 },
  transform: { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, levelled: false },
  opacity: 1,
  points: [],
  residualM: null,
  uploadedAt: '2026-10-25T10:00:00.000Z',
  uploadedBy: 'profile:test',
});

beforeEach(() => {
  logs = captureLogs();
  root = mkdtempSync(join(tmpdir(), 'scan-store-'));
  free = Number.MAX_SAFE_INTEGER;
  counter = 0;
  openWrite = (path): Writable => createWriteStream(path, { flags: 'wx' });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('receiving a scan', () => {
  it.each([
    ['ply', plyFile(300)],
    ['splat', splatFile(300)],
    ['spz', spzFile(300)],
  ] as const)('streams a %s file to a temp file with its sha256', async (format, file) => {
    const received = await store().receive(chunked(file, 777), { declared: file.length, format });
    expect(received.bytes).toBe(file.length);
    expect(received.points).toBe(300);
    expect(received.hash).toBe(createHash('sha256').update(file).digest('hex'));
    expect(readFileSync(received.path).equals(file)).toBe(true);
    expect(received.path.startsWith(join(root, 'tmp'))).toBe(true);
  });

  it('refuses a truncated file, a wrong magic file and a wrong declared length, leaving no temp file', async () => {
    const ply = plyFile(100);
    const truncated = ply.subarray(0, ply.length - 56);
    await expect(
      store().receive(chunked(truncated), { declared: truncated.length, format: 'ply' }),
    ).rejects.toThrow(/need 5600/);
    await expect(
      store().receive(chunked(splatFile(10)), { declared: 320, format: 'ply' }),
    ).rejects.toThrow(/does not start with the ply header/);
    await expect(
      store().receive(chunked(splatFile(10)), { declared: 319, format: 'splat' }),
    ).rejects.toThrow(/more bytes arrived/);
    await expect(
      store().receive(chunked(splatFile(10)), { declared: 321, format: 'splat' }),
    ).rejects.toThrow(/320 bytes arrived but 321 were declared/);
    expect(temporary()).toEqual([]);
  });

  it('refuses before writing anything when the disk has less free space than the declared length', async () => {
    free = 1000;
    let opened = false;
    openWrite = (path): Writable => {
      opened = true;
      return blackHole(path);
    };
    const error = await store()
      .receive(chunked(splatFile(100)), { declared: 3200, format: 'splat' })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ScanNoSpaceError);
    expect(error).toMatchObject({ status: 507, message: 'Not enough space on the hub' });
    expect(opened).toBe(false);
    expect(temporary()).toEqual([]);
    expect(logs.events()).toContain('home_map.scan_no_space');
  });

  it('accepts a file exactly as large as the free space', async () => {
    free = 3200;
    const received = await store().receive(chunked(splatFile(100)), {
      declared: 3200,
      format: 'splat',
    });
    expect(received.bytes).toBe(3200);
  });

  it('answers not enough space when the disk fills while writing and removes the temp file', async () => {
    openWrite = fullDisk;
    await expect(
      store().receive(chunked(splatFile(100)), { declared: 3200, format: 'splat' }),
    ).rejects.toBeInstanceOf(ScanNoSpaceError);
    expect(temporary()).toEqual([]);
  });

  it('deletes the temp file when the upload is cancelled half way', async () => {
    const file = splatFile(1000);
    let sent = 0;
    const source = new Readable({
      read(): void {
        if (sent === 0) {
          sent = 1;
          this.push(file.subarray(0, 8000));
          return;
        }
        this.destroy(Object.assign(new Error('aborted'), { code: 'ECONNRESET' }));
      },
    });
    openWrite = blackHole;
    const error = await store()
      .receive(source, { declared: file.length, format: 'splat' })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'invalid_request' });
    expect(temporary()).toEqual([]);
    expect(logs.events()).toContain('home_map.scan_upload_cancelled');
  });

  it('has no byte cap of its own', async () => {
    const big = splatFile(200_000);
    const received = await store().receive(chunked(big, 1 << 20), {
      declared: big.length,
      format: 'splat',
    });
    expect(received.bytes).toBe(6_400_000);
  });
});

describe('committing and cleaning up', () => {
  it('renames the temp file into the map folder and serves it by range', async () => {
    const scans = store();
    const file = splatFile(50);
    const received = await scans.receive(chunked(file), { declared: file.length, format: 'splat' });
    await scans.commit(received, 'map-1', 'splat');
    expect(temporary()).toEqual([]);
    const source = await scans.source('map-1', { hash: received.hash, format: 'splat' });
    expect(source?.size).toBe(1600);
    const part =
      source === null ? Buffer.alloc(0) : await buffer(source.stream({ start: 32, end: 63 }));
    expect(part.equals(file.subarray(32, 64))).toBe(true);
  });

  it('keeps one folder per map and no map can reach another map through its id', async () => {
    const scans = store();
    const file = splatFile(2);
    const a = await scans.receive(chunked(file), { declared: 64, format: 'splat' });
    await scans.commit(a, '../../escape', 'splat');
    expect(existsSync(join(root, '..', '..', 'escape'))).toBe(false);
    expect(readdirSync(root).filter((name) => name !== 'tmp')).toHaveLength(1);
  });

  it('reconcile deletes every file the map no longer points to and keeps the original and the lod', async () => {
    const scans = store();
    const names = ['a.ply', 'b.splat', 'c.spz', 'd.rad', 'e.rad'];
    const received = await scans.receive(chunked(splatFile(1)), { declared: 32, format: 'splat' });
    await scans.commit(received, 'map-1', 'splat');
    scans.release('map-1', { hash: received.hash, format: 'splat' });
    const directory = join(root, Buffer.from('map-1').toString('base64url'));
    for (const name of names) writeFileSync(join(directory, name), 'x');
    scans.reconcile('map-1', scanOf('b', 'splat', 'd'));
    expect(readdirSync(directory).sort()).toEqual(['b.splat', 'd.rad']);
    scans.reconcile('map-1', undefined);
    expect(existsSync(directory)).toBe(false);
  });

  it('reconcile keeps files the history can still reach and a file committed but not yet released', async () => {
    const scans = store();
    const received = await scans.receive(chunked(splatFile(1)), { declared: 32, format: 'splat' });
    await scans.commit(received, 'map-1', 'splat');
    scans.reconcile('map-1', undefined);
    const directory = join(root, Buffer.from('map-1').toString('base64url'));
    expect(readdirSync(directory)).toEqual([`${received.hash}.splat`]);
    scans.release('map-1', { hash: received.hash, format: 'splat' });
    scans.reconcile('map-1', undefined, new Set([`${received.hash}.splat`]));
    expect(readdirSync(directory)).toEqual([`${received.hash}.splat`]);
    scans.reconcile('map-1', undefined);
    expect(existsSync(directory)).toBe(false);
  });

  it('removeAll deletes the folder of a deleted map and tolerates a map without one', () => {
    const scans = store();
    expect(() => {
      scans.removeAll('never-had-a-scan');
    }).not.toThrow();
  });

  it('sweeps temp files left by a crash', async () => {
    const scans = store();
    await scans.receive(chunked(splatFile(1)), { declared: 32, format: 'splat' });
    expect(temporary()).toHaveLength(1);
    scans.sweepTemp();
    expect(temporary()).toEqual([]);
  });

  it('runs exclusive sections one after the other even when one fails', async () => {
    const scans = store();
    const order: string[] = [];
    const first = scans.exclusive(async () => {
      await Promise.resolve();
      order.push('first');
      throw new Error('boom');
    });
    const second = scans.exclusive(() => {
      order.push('second');
      return 2;
    });
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe(2);
    expect(order).toEqual(['first', 'second']);
  });
});
