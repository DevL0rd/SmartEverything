import type { FileHandle } from 'node:fs/promises';
import type * as FileOperations from 'node:fs/promises';
import type * as Metadata from '../../src/drive/metadata-read';
import type { MediaInfo } from 'mediainfo.js';
import { join } from 'node:path';
import { open } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openProbe } from '../../src/drive/metadata-read';
import { probeVideo } from '../../src/photos/pipeline/probe';

vi.mock('../../src/drive/metadata-read', () => ({ openProbe: vi.fn() }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof FileOperations>();
  return { ...original, open: vi.fn(original.open) };
});

let handle: FileHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('video probe initialization', () => {
  it('explicitly closes the opened descriptor when WASM initialization rejects', async () => {
    const original = await vi.importActual<typeof FileOperations>('node:fs/promises');
    handle = await original.open(import.meta.filename, 'r');
    const close = vi.spyOn(handle, 'close');
    vi.mocked(open).mockResolvedValueOnce(handle);
    const failure = new Error('WASM initialization failed');
    vi.mocked(openProbe).mockRejectedValueOnce(failure);
    await expect(probeVideo(import.meta.filename)).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
    await expect(handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
  });
});

async function initializedProbe(
  path: string,
): Promise<{ readonly handle: FileHandle; readonly info: MediaInfo }> {
  const files = await vi.importActual<typeof FileOperations>('node:fs/promises');
  const metadata = await vi.importActual<typeof Metadata>('../../src/drive/metadata-read');
  const info = await metadata.openProbe();
  handle = await files.open(path, 'r');
  vi.mocked(open).mockResolvedValueOnce(handle);
  vi.mocked(openProbe).mockResolvedValueOnce(info);
  return { handle, info };
}

const VIDEO = join(import.meta.dirname, '../fixtures/drive-media/clip-gps.mp4');

it('closes both resources after a successful real video analysis', async () => {
  const resources = await initializedProbe(VIDEO);
  const closeFile = vi.spyOn(resources.handle, 'close');
  const closeInfo = vi.spyOn(resources.info, 'close');
  expect(await probeVideo(VIDEO)).toMatchObject({ durationSeconds: 1, videoCodec: 'AVC' });
  expect(closeFile).toHaveBeenCalledOnce();
  expect(closeInfo).toHaveBeenCalledOnce();
  await expect(resources.handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
});

it('closes both resources when analysis rejects', async () => {
  const resources = await initializedProbe(VIDEO);
  const closeFile = vi.spyOn(resources.handle, 'close');
  const closeInfo = vi.spyOn(resources.info, 'close');
  const failure = new Error('Analysis failed');
  vi.spyOn(resources.info, 'analyzeData').mockRejectedValueOnce(failure);
  await expect(probeVideo(VIDEO)).rejects.toBe(failure);
  expect(closeFile).toHaveBeenCalledOnce();
  expect(closeInfo).toHaveBeenCalledOnce();
  await expect(resources.handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
});

it('closes the descriptor even when MediaInfo cleanup throws', async () => {
  const resources = await initializedProbe(VIDEO);
  const closeFile = vi.spyOn(resources.handle, 'close');
  const originalClose = resources.info.close.bind(resources.info);
  const failure = new Error('MediaInfo close failed');
  vi.spyOn(resources.info, 'close').mockImplementationOnce(() => {
    throw failure;
  });
  try {
    await expect(probeVideo(VIDEO)).rejects.toBe(failure);
    expect(closeFile).toHaveBeenCalledOnce();
    await expect(resources.handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
  } finally {
    originalClose();
  }
});
