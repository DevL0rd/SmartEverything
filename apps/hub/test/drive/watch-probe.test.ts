import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  watch,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface Probe {
  readonly names: Set<string>;
  readonly errors: Error[];
  readonly close: () => void;
  readonly seen: (name: string) => Promise<void>;
}

const closers: (() => void)[] = [];
let base = '';

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'watch-probe-'));
});

afterEach(() => {
  for (const close of closers.splice(0)) close();
  rmSync(base, { recursive: true, force: true });
});

const probe = (watchers: readonly FSWatcher[]): Probe => {
  const names = new Set<string>();
  const errors: Error[] = [];
  const waiting: { readonly name: string; readonly resolve: () => void }[] = [];
  const record = (name: string): void => {
    names.add(name);
    for (const entry of waiting.filter((candidate) => candidate.name === name)) entry.resolve();
  };
  for (const watcher of watchers) {
    watcher.on('change', (_type, name) => {
      record(String(name));
    });
    watcher.on('error', (error) => {
      errors.push(error);
    });
  }
  const close = (): void => {
    for (const watcher of watchers) watcher.close();
  };
  closers.push(close);
  return {
    names,
    errors,
    close,
    seen: (name) =>
      names.has(name)
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              reject(new Error(`no event for ${name}`));
            }, 4000);
            waiting.push({
              name,
              resolve: () => {
                clearTimeout(timer);
                resolve();
              },
            });
          }),
  };
};

const watchRecursive = (root: string): Probe => probe([watch(root, { recursive: true })]);

const inotifyWatchCount = (): number => {
  let total = 0;
  for (const fd of readdirSync('/proc/self/fdinfo')) {
    try {
      total += readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('inotify wd:')).length;
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'EACCES')
      ))
        throw error;
    }
  }
  return total;
};

const directoryTree = (root: string, directories: number): string => {
  mkdirSync(root, { recursive: true });
  const queue = [root];
  let made = 0;
  while (made < directories) {
    const parent = queue.shift();
    if (parent === undefined) break;
    for (let index = 0; index < 20 && made < directories; index += 1) {
      const child = join(parent, `d${String(index)}`);
      mkdirSync(child);
      queue.push(child);
      made += 1;
    }
  }
  return root;
};

const accessDenied = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'EACCES';

const partitionedWatch = (root: string): Probe => {
  const watchers: FSWatcher[] = [];
  const attach = (directory: string): void => {
    try {
      watchers.push(watch(directory, { recursive: true }));
      return;
    } catch (error) {
      if (!accessDenied(error)) throw error;
    }
    try {
      watchers.push(watch(directory));
    } catch (error) {
      if (accessDenied(error)) return;
      throw error;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) attach(join(directory, entry.name));
    }
  };
  attach(root);
  return probe(watchers);
};

describe('recursive fs.watch on Linux', () => {
  it('reports create, rename and delete five levels deep with the relative path', async () => {
    const root = join(base, 'deep');
    const deepest = join(root, 'a/b/c/d/e');
    mkdirSync(deepest, { recursive: true });
    const watcher = watchRecursive(root);
    writeFileSync(join(deepest, 'f.txt'), 'x');
    await watcher.seen('a/b/c/d/e/f.txt');
    renameSync(join(deepest, 'f.txt'), join(deepest, 'g.txt'));
    await watcher.seen('a/b/c/d/e/g.txt');
    rmSync(join(deepest, 'g.txt'));
    expect(watcher.errors).toEqual([]);
  });

  it('keeps watching a subtree created by one mkdir -p and a populated folder moved in', async () => {
    const root = join(base, 'root');
    mkdirSync(root);
    const outside = join(base, 'outside');
    mkdirSync(join(outside, 'a/b'), { recursive: true });
    const watcher = watchRecursive(root);
    mkdirSync(join(root, 'n1/n2/n3'), { recursive: true });
    await watcher.seen('n1/n2/n3');
    writeFileSync(join(root, 'n1/n2/n3/late.txt'), 'y');
    await watcher.seen('n1/n2/n3/late.txt');
    renameSync(outside, join(root, 'moved'));
    await watcher.seen('moved');
    writeFileSync(join(root, 'moved/a/b/inside.txt'), 'z');
    await watcher.seen('moved/a/b/inside.txt');
  });

  it('watches ten thousand directories with one inotify watch each and still delivers events', async () => {
    const root = directoryTree(join(base, 'big'), 10000);
    const before = inotifyWatchCount();
    const started = performance.now();
    const watcher = watchRecursive(root);
    const startMs = performance.now() - started;
    expect(inotifyWatchCount() - before).toBeGreaterThanOrEqual(10000);
    expect(startMs).toBeLessThan(2000);
    writeFileSync(join(root, 'd0/d0/d0/z.txt'), '1');
    await watcher.seen('d0/d0/d0/z.txt');
    expect(watcher.errors).toEqual([]);
  });

  it('refuses the whole root when any subdirectory is unreadable and names that directory', () => {
    if (process.getuid?.() === 0) return;
    const root = join(base, 'locked');
    const locked = join(root, 'ok/locked');
    mkdirSync(join(locked, 'inner'), { recursive: true });
    chmodSync(locked, 0);
    try {
      expect(() => watch(root, { recursive: true })).toThrow(
        expect.objectContaining({ code: 'EACCES', path: locked }),
      );
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('watches every readable subtree when the root is split around an unreadable directory', async () => {
    if (process.getuid?.() === 0) return;
    const root = join(base, 'split');
    const locked = join(root, 'ok/locked');
    mkdirSync(join(locked, 'inner'), { recursive: true });
    mkdirSync(join(root, 'ok/open/deeper'), { recursive: true });
    mkdirSync(join(root, 'other/deeper'), { recursive: true });
    chmodSync(locked, 0);
    try {
      const watcher = partitionedWatch(root);
      writeFileSync(join(root, 'ok/open/deeper/a.txt'), '1');
      writeFileSync(join(root, 'other/deeper/b.txt'), '1');
      await watcher.seen('deeper/a.txt');
      await watcher.seen('deeper/b.txt');
      expect(watcher.errors).toEqual([]);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('throws ENOENT synchronously for a missing root', () => {
    expect(() => watch(join(base, 'missing'), { recursive: true })).toThrow(
      expect.objectContaining({ code: 'ENOENT' }),
    );
  });

  it('does not signal an error when the watched root is deleted', async () => {
    const root = join(base, 'gone');
    mkdirSync(join(root, 'x'), { recursive: true });
    const watcher = watchRecursive(root);
    rmSync(root, { recursive: true });
    await watcher.seen('x');
    expect(watcher.errors).toEqual([]);
  });

  it('never reports a queue overflow, so a directory re-read after the burst is the only way to know every name', async () => {
    const root = join(base, 'burst');
    mkdirSync(root);
    const watcher = watchRecursive(root);
    const created = 30000;
    for (let index = 0; index < created; index += 1)
      writeFileSync(join(root, `f${String(index)}`), '');
    await watcher.seen('f0');
    expect(watcher.errors).toEqual([]);
    const reread = new Set(
      readdirSync(root, { recursive: true }).map((entry) =>
        relative(root, join(root, String(entry))),
      ),
    );
    expect(reread.size).toBe(created);
    expect(watcher.names.size).toBeLessThanOrEqual(created);
  });
});
