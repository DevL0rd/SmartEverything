import { mkdtemp, readdir, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lockFileName, saveLikeLibreOffice, saveLikeQt } from './workloads-saver.ts';

const SCRATCH = '/var/tmp/claude-agents';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(SCRATCH, 'saver-test-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe.each([
  ['the Qt save', saveLikeQt],
  ['the LibreOffice save', saveLikeLibreOffice],
])('%s', (_name, save) => {
  it('replaces the content and keeps the mode of the existing file', async () => {
    const target = join(directory, 'doc.txt');
    await writeFile(target, 'old');
    await chmod(target, 0o640);
    save(target, Buffer.from('new content that is longer'));
    expect(await readFile(target, 'utf8')).toBe('new content that is longer');
    expect((await stat(target)).mode & 0o7777).toBe(0o640);
  });

  it('leaves no temporary or lock file behind', async () => {
    const target = join(directory, 'doc.txt');
    await writeFile(target, 'old');
    save(target, Buffer.from('a'));
    save(target, Buffer.from('b'));
    expect(await readdir(directory)).toEqual(['doc.txt']);
  });

  it('creates the file when it does not exist yet', async () => {
    const target = join(directory, 'fresh.txt');
    save(target, Buffer.from('first'));
    expect(await readFile(target, 'utf8')).toBe('first');
  });
});

describe('the LibreOffice save', () => {
  it('refuses to start while another lock file exists and keeps it', async () => {
    const target = join(directory, 'doc.txt');
    await writeFile(target, 'old');
    await writeFile(lockFileName(target), 'held');
    expect(() => {
      saveLikeLibreOffice(target, Buffer.from('new'));
    }).toThrow();
    expect(await readFile(lockFileName(target), 'utf8')).toBe('held');
    expect(await readFile(target, 'utf8')).toBe('old');
  });
});
