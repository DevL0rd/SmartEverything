import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createContentReader } from './content-reader';
import { blobFileReader } from './file-reader';

const CHUNK = 4 * 1024 * 1024;
const source = {
  uri: 'content://media/external/video/media/123',
  size: 12 * 1024 ** 3,
  type: 'video/mp4',
};

describe('content upload reader', () => {
  it('reads only the requested bounded range of a virtual twelve GiB video', async () => {
    const calls: number[][] = [];
    const reader = createContentReader(
      source,
      (offset, bytes) => {
        calls.push([offset, bytes]);
        return Promise.resolve(new Blob([new Uint8Array(bytes)]));
      },
      CHUNK,
    );
    const file = await reader.fileReader.openFile(reader.input, CHUNK);
    const chunk = await file.slice(source.size - CHUNK, source.size);
    expect(z.instanceof(Blob).parse(chunk.value).size).toBe(CHUNK);
    expect(chunk.done).toBe(true);
    expect(calls).toEqual([[source.size - CHUNK, CHUNK]]);
    file.close();
  });

  it('rejects a whole video read before touching its content', async () => {
    let reads = 0;
    const reader = createContentReader(
      source,
      () => {
        reads += 1;
        return Promise.resolve(new Blob());
      },
      CHUNK,
    );
    const file = await reader.fileReader.openFile(reader.input, CHUNK);
    await expect(file.slice(0, source.size)).rejects.toThrow('Invalid media upload range');
    expect(reads).toBe(0);
  });

  it('aborts an in-flight read on pause and permits bounded reads after resume', async () => {
    const signals: AbortSignal[] = [];
    let finish: (value: Blob) => void = () => undefined;
    const reader = createContentReader(
      source,
      (_offset, bytes, signal) => {
        signals.push(signal);
        if (signals.length > 1) return Promise.resolve(new Blob([new Uint8Array(bytes)]));
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      CHUNK,
    );
    const file = await reader.fileReader.openFile(reader.input, CHUNK);
    const pending = file.slice(0, 2);
    const closing = reader.close();
    expect(signals[0]?.aborted).toBe(true);
    finish(new Blob(['ab']));
    await expect(pending).rejects.toThrow();
    await closing;
    expect(z.instanceof(Blob).parse((await file.slice(0, 2)).value).size).toBe(2);
    expect(signals[1]?.aborted).toBe(false);
    file.close();
  });

  it('rejects a changed size and a mismatched source', async () => {
    const reader = createContentReader(source, () => Promise.resolve(new Blob()), CHUNK);
    await expect(reader.fileReader.openFile('content://other', CHUNK)).rejects.toThrow(
      'does not match',
    );
    const file = await reader.fileReader.openFile(reader.input, CHUNK);
    await expect(file.slice(0, 4)).rejects.toThrow('Media changed');
  });

  it('preserves normal Blob uploads byte for byte', async () => {
    const blob = new Blob([new Uint8Array([0, 255, 128, 1])]);
    const file = await blobFileReader.openFile(blob, CHUNK);
    const chunk = await file.slice(1, 3);
    expect(new Uint8Array(await z.instanceof(Blob).parse(chunk.value).arrayBuffer())).toEqual(
      new Uint8Array([255, 128]),
    );
    file.close();
  });
});

it('offers a real sequential stream reader with bounded Blob chunks to tus', async () => {
  const content = { uri: 'content://media/video/2', size: 5, type: 'video/mp4' };
  const ranges: number[][] = [];
  const reader = createContentReader(
    content,
    (offset, bytes) => {
      ranges.push([offset, bytes]);
      return Promise.resolve(new Blob([new Uint8Array(bytes)]));
    },
    3,
  );
  expect((await reader.input.read()).value?.size).toBe(3);
  expect((await reader.input.read()).value?.size).toBe(2);
  expect(await reader.input.read()).toEqual({ done: true, value: undefined });
  expect(ranges).toEqual([
    [0, 3],
    [3, 2],
  ]);
  await reader.close();
});
