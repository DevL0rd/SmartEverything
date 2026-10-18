import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscordInputError } from '../../../src/plugins/builtin/discord/errors';
import {
  assertTotal,
  inlineFile,
  machineFile,
  pathFile,
  urlFile,
} from '../../../src/plugins/builtin/discord/outgoing-files';

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'discord-files-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('files to send', () => {
  it('loads any readable file by path, wherever it lives, with a cleaned name', async () => {
    const path = join(folder, 'Shot (1).txt');
    await writeFile(path, 'hello');
    const file = await pathFile(path, 1024);
    expect(file).toMatchObject({ name: 'Shot -1-.txt' });
    expect(file.data.toString()).toBe('hello');
  });

  it('refuses relative paths, folders and files over the size setting', async () => {
    await expect(pathFile('relative.txt', 1024)).rejects.toThrow('Path must be absolute');
    await expect(pathFile(folder, 1024)).rejects.toThrow('not a regular file');
    const path = join(folder, 'big.bin');
    await writeFile(path, Buffer.alloc(2048));
    await expect(pathFile(path, 1024)).rejects.toThrow('larger than the 1 KiB');
    await expect(pathFile(join(folder, 'missing.txt'), 1024)).rejects.toBeInstanceOf(
      DiscordInputError,
    );
  });

  it('accepts inline text and base64 and downloads urls through the shared downloader', async () => {
    expect((await inlineFile({ name: 'a.txt', text: 'hi' }, 100)).data.toString()).toBe('hi');
    expect(
      (
        await inlineFile({ name: 'a.bin', base64: Buffer.from('hey').toString('base64') }, 100)
      ).data.toString(),
    ).toBe('hey');
    const file = await urlFile(
      'https://example.test/files/report%20one.pdf?x=1',
      undefined,
      100,
      () => Promise.resolve({ data: Buffer.from('pdf'), type: 'application/pdf' }),
    );
    expect(file).toMatchObject({ name: 'report one.pdf', contentType: 'application/pdf' });
    await expect(
      urlFile('https://example.test/a', 'a.txt', 100, () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow('Download of example.test/a failed: offline');
  });

  it('keeps a message under the Discord total', () => {
    const big = { data: Buffer.alloc(14 * 1024 * 1024), name: 'a', contentType: 'x/y' };
    expect(() => {
      assertTotal([big]);
    }).not.toThrow();
    expect(() => {
      assertTotal([big, big]);
    }).toThrow('over Discord’s');
  });

  it('takes a file from another machine through the same read, cleaned and size-checked', async () => {
    const file = await machineFile(
      { machine: 'Laptop', path: '/home/sam/Notes (1).md' },
      () => Promise.resolve({ data: Buffer.from('notes'), name: 'Notes (1).md' }),
      1024,
    );
    expect(file).toMatchObject({ name: 'Notes -1-.md' });
    expect(file?.data.toString()).toBe('notes');
    await expect(
      machineFile(
        { machine: 'Laptop', path: '/big' },
        () => Promise.resolve({ data: Buffer.alloc(2048), name: 'big.bin' }),
        1024,
      ),
    ).rejects.toThrow('larger than the 1 KiB');
  });

  it('leaves the home hub’s own machine to the local read, and names a failed machine read', async () => {
    expect(
      await machineFile({ machine: 'Hub', path: '/x' }, () => Promise.resolve(null), 10),
    ).toBeNull();
    await expect(
      machineFile(
        { machine: 'Laptop', path: '/x' },
        () => Promise.reject(new Error('offline')),
        10,
      ),
    ).rejects.toThrow('Could not read /x on Laptop: offline');
  });
});
