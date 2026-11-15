import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RingSoundCache } from '../src/planner/ring-sounds.js';
import type { DesktopRing } from '../src/planner/ring-types.js';

const SONG = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e01';
const OTHER = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e02';
const folders: string[] = [];

async function folder(): Promise<string> {
  const made = await mkdtemp(join(tmpdir(), 'planner-ring-sounds-'));
  folders.push(made);
  return join(made, 'sounds');
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body ?? new ReadableStream();
}

function ringWith(sound: DesktopRing['sound']): DesktopRing {
  return {
    ringKey: `alarm:${SONG}`,
    kind: 'alarm',
    refId: SONG,
    dueAt: '2030-01-01T07:00:00.000Z',
    label: null,
    rampSeconds: 0,
    sound,
    snoozeLimit: null,
    snoozes: 0,
    challenge: { kind: 'none' },
  };
}

const song = { kind: 'file', item_id: SONG, name: 'Morning.MP3', etag: 'e1' } as const;

afterEach(async () => {
  for (const made of folders.splice(0)) await rm(made, { recursive: true, force: true });
});

describe('desktop ring sounds', () => {
  it('downloads a file sound once and plays it from this computer', async () => {
    const download = vi.fn(() => Promise.resolve(streamOf('song bytes')));
    const cache = new RingSoundCache(await folder(), download);
    await cache.install([ringWith(song)]);
    await cache.install([ringWith(song)]);
    expect(download).toHaveBeenCalledOnce();
    const source = await cache.sourceOf(song);
    if (source.kind !== 'file') throw new Error(`expected a file source, got ${source.kind}`);
    expect(source.url.endsWith('.mp3')).toBe(true);
    await expect(readFile(fileURLToPath(source.url), 'utf8')).resolves.toBe('song bytes');
  });

  it('downloads again when the file changed and removes files no ring needs', async () => {
    const sounds = await folder();
    const cache = new RingSoundCache(sounds, () => Promise.resolve(streamOf('bytes')));
    await cache.install([ringWith(song)]);
    await writeFile(join(sounds, 'left-over.part'), 'x');
    await cache.install([ringWith({ ...song, etag: 'e2' })]);
    expect(await readdir(sounds)).toHaveLength(1);
    await cache.install([ringWith({ kind: 'tone', id: 'default' })]);
    expect(await readdir(sounds)).toEqual([]);
  });

  it('rings the tone and says why when a file could not be downloaded', async () => {
    const cache = new RingSoundCache(await folder(), () => Promise.reject(new Error('offline')));
    await cache.install([ringWith(song)]);
    await expect(cache.sourceOf(song)).resolves.toEqual({
      kind: 'tone',
      reason: 'Morning.MP3 could not be downloaded to this computer.',
    });
    await expect(cache.sourceOf({ ...song, item_id: OTHER })).resolves.toEqual({
      kind: 'tone',
      reason: 'Morning.MP3 has not finished downloading to this computer.',
    });
  });

  it('streams radio from its address and rings tones with nothing to download', async () => {
    const download = vi.fn(() => Promise.resolve(streamOf('')));
    const cache = new RingSoundCache(await folder(), download);
    const radio = {
      kind: 'radio',
      station_id: 's1',
      name: 'Morning FM',
      url: 'https://radio.example/stream',
    } as const;
    await cache.install([ringWith(radio), ringWith({ kind: 'tone', id: 'default' })]);
    expect(download).not.toHaveBeenCalled();
    await expect(cache.sourceOf(radio)).resolves.toEqual({
      kind: 'radio',
      url: radio.url,
      name: 'Morning FM',
    });
    await expect(cache.sourceOf({ kind: 'tone', id: 'default' })).resolves.toEqual({
      kind: 'tone',
      reason: null,
    });
  });
});
