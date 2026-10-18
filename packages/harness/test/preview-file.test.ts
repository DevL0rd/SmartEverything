import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewFileScope, readPreviewFile } from '../src/process/preview-file-read';
import { PreviewFileWatch } from '../src/process/preview-file-watch';
import type { PreviewFileUpdates } from '../src/process/preview-file-watch';

let directory: string;
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'preview-file-')));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('previewing an HTML file of the workspace', () => {
  it('opens a file in a workspace reached through a symbolic link', async () => {
    await mkdir(join(directory, 'real'));
    await writeFile(join(directory, 'real', 'page.html'), '<p>hi</p>');
    await symlink(join(directory, 'real'), join(directory, 'alias'));

    const scope = await previewFileScope(join(directory, 'alias'), 'page.html');

    expect(await readPreviewFile(scope)).toBe('<p>hi</p>');
  });

  it('refuses a file outside the workspace', async () => {
    await mkdir(join(directory, 'work'));
    await writeFile(join(directory, 'outside.html'), '<p>no</p>');

    await expect(previewFileScope(join(directory, 'work'), '../outside.html')).rejects.toThrow(
      /inside the current workspace/u,
    );
  });

  it('refuses a file that is not HTML', async () => {
    await writeFile(join(directory, 'notes.txt'), 'plain');

    await expect(previewFileScope(directory, 'notes.txt')).rejects.toThrow(/HTML file/u);
  });
});

describe('watching a previewed file', () => {
  function updates(): PreviewFileUpdates & {
    readonly published: string[];
    readonly validate: ReturnType<typeof vi.fn<() => Promise<void>>>;
  } {
    const published: string[] = [];
    return {
      published,
      validate: vi.fn(() => Promise.resolve()),
      publish: (html): Promise<void> => {
        published.push(html);
        return Promise.resolve();
      },
      failed: (cause): void => {
        throw cause instanceof Error ? cause : new Error('watch failed');
      },
    };
  }

  it('publishes an editor-style atomic save once, with one validation per refresh', async () => {
    const path = join(directory, 'page.html');
    await writeFile(path, '<p>one</p>');
    const scope = await previewFileScope(directory, 'page.html');
    const seen = updates();
    const watch = new PreviewFileWatch(scope, '<p>one</p>', seen);
    watch.start();
    await vi.waitFor(() => {
      expect(seen.validate).toHaveBeenCalledTimes(1);
    });

    await writeFile(`${path}.tmp`, '<p>two</p>');
    await rename(`${path}.tmp`, path);

    await vi.waitFor(() => {
      expect(seen.published).toStrictEqual(['<p>two</p>']);
    });
    expect(seen.validate).toHaveBeenCalledTimes(2);
    watch.stop();
  });

  it('does not publish anything after it was stopped', async () => {
    const path = join(directory, 'page.html');
    await writeFile(path, '<p>one</p>');
    const scope = await previewFileScope(directory, 'page.html');
    const seen = updates();
    const watch = new PreviewFileWatch(scope, '<p>one</p>', seen);
    watch.start();
    watch.stop();

    await writeFile(path, '<p>two</p>');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(seen.published).toStrictEqual([]);
  });
});
