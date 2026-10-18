import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { searchProjectFiles } from '../../src/claude/provider/file-search';
import { ProviderInputError } from '../../src/claude/provider/input';

let root = '';

function write(path: string, text = 'x'): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function paths(entries: readonly { readonly path: string }[]): string[] {
  return entries.map((entry) => entry.path);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'file-search-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('project file search for Claude mentions', () => {
  it('follows git ignore rules and lists untracked files in a repository', async () => {
    execFileSync('git', ['init', '-q', root]);
    write('.gitignore', 'dist/\n');
    write('src/app.ts');
    write('dist/bundle.js');
    write('notes/todo.md');
    const found = await searchProjectFiles({ cwd: root, query: 'ts', limit: 50 });
    expect(paths(found.entries)).toContain('src/app.ts');
    expect(paths(found.entries)).not.toContain('dist/bundle.js');
    expect(found.incomplete).toBe(false);
  });

  it('walks a plain folder without hidden or dependency directories', async () => {
    write('readme.md');
    write('node_modules/lib/index.js');
    write('.cache/data.bin');
    write('docs/guide.md');
    const found = await searchProjectFiles({ cwd: root, query: '', limit: 50 });
    expect(paths(found.entries)).toEqual(['docs', 'readme.md', 'docs/guide.md']);
  });

  it('offers directories next to files with their kind', async () => {
    write('docs/guide.md');
    const found = await searchProjectFiles({ cwd: root, query: 'guide', limit: 50 });
    expect(found.entries.map((entry) => [entry.path, entry.entry_kind])).toEqual([
      ['docs/guide.md', 'file'],
    ]);
    const folders = await searchProjectFiles({ cwd: root, query: 'docs', limit: 50 });
    expect(folders.entries.map((entry) => entry.entry_kind)).toContain('directory');
  });

  it('ranks the file name above a matching folder name and reports more results', async () => {
    write('alpha/readme.md');
    write('readme/other.md');
    write('readme.md');
    const found = await searchProjectFiles({ cwd: root, query: 'readme', limit: 2 });
    expect(found.entries).toHaveLength(2);
    expect(found.incomplete).toBe(true);
    expect(paths(found.entries)[0]).toMatch(/readme(\.md)?$/u);
  });

  it('versions an entry by its modification time and size', async () => {
    write('a.txt', 'hello');
    const first = await searchProjectFiles({ cwd: root, query: 'a.txt', limit: 5 });
    write('a.txt', 'hello world');
    const second = await searchProjectFiles({ cwd: root, query: 'a.txt', limit: 5 });
    expect(first.entries[0]?.version).not.toBe(second.entries[0]?.version);
  });

  it('refuses a folder that is not an absolute directory', async () => {
    write('file.txt');
    await expect(
      searchProjectFiles({ cwd: join(root, 'file.txt'), query: '', limit: 5 }),
    ).rejects.toThrow();
    await expect(searchProjectFiles({ cwd: 'relative', query: '', limit: 5 })).rejects.toThrow(
      ProviderInputError,
    );
  });
});
