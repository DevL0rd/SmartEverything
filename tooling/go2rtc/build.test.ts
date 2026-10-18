import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { inTempRoot } from './build';

class BuildFailure extends Error {}
class CleanFailure extends Error {}

const noRelease = (): Promise<void> => Promise.resolve();

describe('go2rtc build workspace', () => {
  it('removes the temp root after a successful build', async () => {
    let seen = '';
    const result = await inTempRoot(async (root) => {
      seen = root;
      await mkdir(join(root, 'gomod', 'pkg'), { recursive: true });
      await writeFile(join(root, 'gomod', 'pkg', 'file.go'), 'package pkg');
      return 'built';
    }, noRelease);
    expect(result).toBe('built');
    expect(existsSync(seen)).toBe(false);
  });

  it('keeps the first error and still removes the temp root when the build fails', async () => {
    const failure = new BuildFailure('go build failed');
    let seen = '';
    const attempt = inTempRoot((root) => {
      seen = root;
      return Promise.reject(failure);
    }, noRelease);
    await expect(attempt).rejects.toBe(failure);
    expect(existsSync(seen)).toBe(false);
  });

  it('keeps the first error and removes the temp root when the module clean fails too', async () => {
    const failure = new BuildFailure('go build failed');
    const release = vi.fn(() => Promise.reject(new CleanFailure('go: not found')));
    let seen = '';
    const attempt = inTempRoot((root) => {
      seen = root;
      return Promise.reject(failure);
    }, release);
    await expect(attempt).rejects.toBe(failure);
    expect(release).toHaveBeenCalledWith(seen);
    expect(existsSync(seen)).toBe(false);
  });

  it('succeeds and removes the temp root when only the module clean fails', async () => {
    let seen = '';
    const result = await inTempRoot(
      (root) => {
        seen = root;
        return Promise.resolve('built');
      },
      () => Promise.reject(new CleanFailure('go: not found')),
    );
    expect(result).toBe('built');
    expect(existsSync(seen)).toBe(false);
  });
});
