import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KernelFile,
  KernelFileTooLargeError,
  KernelFiles,
} from '../../src/node/collectors/linux/kernel-file';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-kernel-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('KernelFile', () => {
  it('reads a file again from the start each time, seeing what changed', async () => {
    const path = join(directory, 'stat');
    await writeFile(path, 'cpu 1 2 3');
    const file = new KernelFile(path);
    expect(file.read()).toBe('cpu 1 2 3');
    await writeFile(path, 'cpu 4 5 6 7');
    expect(file.read()).toBe('cpu 4 5 6 7');
    await writeFile(path, 'x');
    expect(file.read()).toBe('x');
    file.close();
  });

  it('reads a file larger than its first buffer in full', async () => {
    const path = join(directory, 'big');
    const text = 'line of text\n'.repeat(2000);
    await writeFile(path, text);
    const file = new KernelFile(path);
    expect(file.read()).toBe(text);
    file.close();
  });

  it('reads a file that is exactly as large as the first buffer', async () => {
    const path = join(directory, 'exact');
    await writeFile(path, 'a'.repeat(4096));
    const file = new KernelFile(path);
    expect(file.read()).toHaveLength(4096);
    file.close();
  });

  it('refuses a file over 4 MiB and names it', async () => {
    const path = join(directory, 'huge');
    await writeFile(path, Buffer.alloc(4 * 1024 * 1024 + 10, 97));
    const file = new KernelFile(path);
    expect(() => file.read()).toThrow(KernelFileTooLargeError);
    expect(() => file.read()).toThrow(path);
  });

  it('fails on a missing file and can read again once the file exists', async () => {
    const path = join(directory, 'later');
    const file = new KernelFile(path);
    expect(() => file.read()).toThrow();
    await writeFile(path, 'here');
    expect(file.read()).toBe('here');
    file.close();
  });

  it('keeps no read buffer per file, however many files are open', async () => {
    const path = join(directory, 'shared');
    await writeFile(path, 'cpu 1 2 3');
    const before = process.memoryUsage().arrayBuffers;
    const files = Array.from({ length: 600 }, () => new KernelFile(path));
    for (const file of files) expect(file.read()).toBe('cpu 1 2 3');
    const grown = process.memoryUsage().arrayBuffers - before;
    for (const file of files) file.close();
    expect(grown).toBeLessThan(1024 * 1024);
  });

  it('closing twice does nothing', async () => {
    const path = join(directory, 'twice');
    await writeFile(path, 'x');
    const file = new KernelFile(path);
    file.read();
    file.close();
    expect(() => {
      file.close();
    }).not.toThrow();
  });
});

describe('KernelFiles', () => {
  it('reads any path and keeps reading it as it changes', async () => {
    const path = join(directory, 'meminfo');
    await writeFile(path, 'one');
    const files = new KernelFiles();
    expect(files.read(path)).toBe('one');
    await writeFile(path, 'two');
    expect(files.read(path)).toBe('two');
    files.closeAll();
  });

  it('throws for a path that cannot be read and tries it fresh next time', async () => {
    const path = join(directory, 'gone');
    const files = new KernelFiles();
    expect(() => files.read(path)).toThrow();
    await writeFile(path, 'back');
    expect(files.read(path)).toBe('back');
    files.closeAll();
  });

  it('forgets the paths it is told to drop and keeps the others readable', async () => {
    const keep = join(directory, 'keep');
    const drop = join(directory, 'drop');
    await writeFile(keep, 'keep');
    await writeFile(drop, 'drop');
    const files = new KernelFiles();
    files.read(keep);
    files.read(drop);
    files.drop(drop);
    expect(files.read(keep)).toBe('keep');
    expect(files.read(drop)).toBe('drop');
    files.closeAll();
  });
});
