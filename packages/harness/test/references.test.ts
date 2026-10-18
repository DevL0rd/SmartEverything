import { afterEach, describe, expect, it } from 'vitest';
import { link, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AI_REFERENCE_SEARCH } from '@smarteverything/domain';
import type {
  AiNativeReferenceResult,
  AiReferenceSearch,
  AiReferenceSummary,
} from '@smarteverything/domain';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function tree(root: string, files: readonly string[]): Promise<void> {
  for (const file of files) {
    const path = join(root, file);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, file);
  }
}

async function openedOn(directory: string): Promise<{ host: RuntimeFixture; id: string }> {
  fixture = await bootRuntime();
  const options = { ...fixture.sessionOptions(), directory };
  await fixture.runtime.create(options);
  return { host: fixture, id: options.sessionId };
}

function search(query: string, change: Partial<AiReferenceSearch> = {}): AiReferenceSearch {
  return AI_REFERENCE_SEARCH.parse({ kinds: ['device_path'], query, ...change });
}

async function find(
  host: RuntimeFixture,
  id: string,
  request: AiReferenceSearch,
): Promise<AiNativeReferenceResult> {
  return host.runtime.referenceOperation(id, { action: 'search', search: request });
}

function paths(items: readonly AiReferenceSummary[]): readonly string[] {
  return items.flatMap((item) =>
    item.reference.kind === 'device_path' ? [item.reference.path] : [],
  );
}

describe('searching files of the primary folder', () => {
  it('finds files in a workspace reached through a symbolic link', async () => {
    fixture = await bootRuntime();
    const real = join(fixture.directory, 'real-projects', 'site');
    await tree(real, ['index.html', 'docs/guide.md']);
    const alias = join(fixture.directory, 'projects');
    await symlink(join(fixture.directory, 'real-projects'), alias);
    const { host, id } = await openedOn(join(alias, 'site'));

    const result = await find(host, id, search('guide'));

    expect(paths(result.items)).toStrictEqual(['docs/guide.md']);
  });

  it('finds files that are hard-linked, like the packages of node_modules', async () => {
    fixture = await bootRuntime();
    const root = join(fixture.directory, 'site');
    await tree(root, ['store/original.txt']);
    await link(join(root, 'store/original.txt'), join(root, 'copy-of-original.txt'));
    const { host, id } = await openedOn(root);

    const result = await find(host, id, search('original'));

    expect(paths(result.items)).toStrictEqual(['copy-of-original.txt', 'store/original.txt']);
  });

  it('lists .git and node_modules and lets a chat drill into them', async () => {
    fixture = await bootRuntime();
    const root = join(fixture.directory, 'site');
    await tree(root, ['src/app.ts', 'node_modules/pkg/index.js', '.git/config']);
    const { host, id } = await openedOn(root);

    const listed = await find(host, id, search('node_modules'));
    const [modules] = listed.items;
    if (modules?.reference.kind !== 'device_path') throw new Error('node_modules was not listed.');
    const git = await find(host, id, search('.git'));
    const inside = await find(
      host,
      id,
      search('', { container: { ...modules.reference, entry_kind: 'directory' } }),
    );

    expect(paths(listed.items)).toStrictEqual(['node_modules']);
    expect(paths(git.items)).toStrictEqual(['.git']);
    expect(paths(inside.items)).toStrictEqual(['node_modules/pkg']);
  });

  it('skips the contents of .git and node_modules and lists shallow entries first', async () => {
    fixture = await bootRuntime();
    const root = join(fixture.directory, 'site');
    await tree(root, [
      'src/deep/target.ts',
      'target.md',
      'node_modules/pkg/target.js',
      '.git/target',
    ]);
    const { host, id } = await openedOn(root);

    const result = await find(host, id, search('target'));

    expect(paths(result.items)).toStrictEqual(['target.md', 'src/deep/target.ts']);
  });

  it('pages through every match of a large folder instead of stopping after a time budget', async () => {
    fixture = await bootRuntime();
    const root = join(fixture.directory, 'big');
    const names = Array.from({ length: 700 }, (_, index) => `bulk/file-${String(index)}.txt`);
    await tree(root, names);
    const { host, id } = await openedOn(root);

    const seen: string[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await find(
        host,
        id,
        search('file-', { limit: 50, cursor: cursor ?? undefined }),
      );
      seen.push(...paths(page.items));
      cursor = page.next_cursor;
    } while (cursor !== null);

    expect(seen).toHaveLength(700);
    expect(new Set(seen).size).toBe(700);
  });

  it('lists only the direct children of a chosen folder', async () => {
    fixture = await bootRuntime();
    const root = join(fixture.directory, 'site');
    await tree(root, ['docs/a.md', 'docs/more/b.md', 'top.md']);
    const { host, id } = await openedOn(root);
    const [docs] = (await find(host, id, search('docs'))).items;
    if (docs?.reference.kind !== 'device_path') throw new Error('The docs folder was not listed.');

    const inside = await find(
      host,
      id,
      search('', { container: { ...docs.reference, entry_kind: 'directory' } }),
    );

    expect(paths(inside.items)).toStrictEqual(['docs/a.md', 'docs/more']);
  });
});

describe('sending a message with a selected file', () => {
  it('still accepts the file after it was edited since it was selected', async () => {
    fixture = await bootRuntime();
    const root = join(fixture.directory, 'site');
    await tree(root, ['notes.md']);
    const { host, id } = await openedOn(root);
    const [selected] = (await find(host, id, search('notes'))).items;
    if (selected === undefined) throw new Error('The file was not listed.');
    await writeFile(join(root, 'notes.md'), 'edited after it was selected, so a longer file');

    await host.runtime.resolveReferences(id, [selected.reference]);
  });

  it('refuses a file that was deleted since it was selected', async () => {
    fixture = await bootRuntime();
    const root = join(fixture.directory, 'site');
    await tree(root, ['notes.md']);
    const { host, id } = await openedOn(root);
    const [selected] = (await find(host, id, search('notes'))).items;
    if (selected === undefined) throw new Error('The file was not listed.');
    await rm(join(root, 'notes.md'));

    await expect(host.runtime.resolveReferences(id, [selected.reference])).rejects.toThrow(
      /gone or moved/u,
    );
  });
});
