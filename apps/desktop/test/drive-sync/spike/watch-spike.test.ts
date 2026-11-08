import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { tmpdir } from 'node:os';
import { setImmediate } from 'node:timers/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface Observation {
  readonly names: ReadonlySet<string>;
  readonly kinds: ReadonlyMap<string, ReadonlySet<string>>;
  readonly delivered: () => number;
  readonly settle: () => Promise<void>;
  readonly waitFor: (name: string) => Promise<void>;
}

interface ParcelEvent {
  readonly type: string;
  readonly path: string;
}

interface ParcelSubscription {
  readonly unsubscribe: () => Promise<void>;
}

interface ParcelModule {
  readonly subscribe: (
    directory: string,
    callback: (error: Error | null, events: readonly ParcelEvent[]) => void,
  ) => Promise<ParcelSubscription>;
}

const QUEUE_LIMIT_FILE = '/proc/sys/fs/inotify/max_queued_events';
const SENTINEL_PREFIX = '.watch-sentinel-';
const PRODUCER_SCRIPT =
  "const fs=require('node:fs');const[d,n]=[process.argv[1],Number(process.argv[2])];for(let i=0;i<n;i++)fs.writeFileSync(d+'/f'+i,'');";
const NESTED_PRODUCER_SCRIPT =
  "const fs=require('node:fs');const[d,a,b]=[process.argv[1],Number(process.argv[2]),Number(process.argv[3])];for(let i=0;i<a;i++){const s=d+'/tree/d'+i+'/sub';fs.mkdirSync(s,{recursive:true});for(let j=0;j<b;j++)fs.writeFileSync(s+'/f'+j,'');}";

let root = '';
let sentinelCounter = 0;
const open: (() => void | Promise<void>)[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'drive-watch-spike-'));
});

afterEach(async () => {
  for (const close of open.splice(0)) {
    await close();
  }
  await rm(root, { recursive: true, force: true });
});

function normalise(name: string): string {
  return name.split(path.sep).join('/');
}

function createObservation(): {
  readonly observation: Observation;
  readonly record: (kind: string, name: string) => void;
} {
  const names = new Set<string>();
  const kinds = new Map<string, Set<string>>();
  const waiters = new Map<string, (() => void)[]>();
  let count = 0;
  const record = (kind: string, rawName: string): void => {
    const name = normalise(rawName);
    count += 1;
    names.add(name);
    const seen = kinds.get(name) ?? new Set<string>();
    seen.add(kind);
    kinds.set(name, seen);
    for (const resolve of waiters.get(name) ?? []) {
      resolve();
    }
    waiters.delete(name);
  };
  const waitFor = (name: string): Promise<void> => {
    if (names.has(name)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const pending = waiters.get(name) ?? [];
      pending.push(resolve);
      waiters.set(name, pending);
    });
  };
  const settle = async (): Promise<void> => {
    sentinelCounter += 1;
    const sentinel = SENTINEL_PREFIX + String(sentinelCounter);
    await writeFile(path.join(root, sentinel), '');
    await waitFor(sentinel);
  };
  const observation: Observation = {
    names,
    kinds,
    delivered: () => count,
    settle,
    waitFor,
  };
  return { observation, record };
}

function watchNative(directory: string): Promise<Observation> {
  const { observation, record } = createObservation();
  const watcher: FSWatcher = watch(directory, { recursive: true }, (kind, name) => {
    if (name !== null) {
      record(kind, name);
    }
  });
  open.push(() => {
    watcher.close();
  });
  return Promise.resolve(observation);
}

function isParcelModule(value: unknown): value is ParcelModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'subscribe' in value &&
    typeof value.subscribe === 'function'
  );
}

async function loadParcel(modulePath: string): Promise<ParcelModule> {
  const loaded: unknown = await import(pathToFileURL(modulePath).href);
  const candidate =
    typeof loaded === 'object' && loaded !== null && 'default' in loaded ? loaded.default : loaded;
  if (!isParcelModule(candidate)) {
    throw new Error('parcel module does not export subscribe');
  }
  return candidate;
}

async function watchParcel(modulePath: string, directory: string): Promise<Observation> {
  const parcel = await loadParcel(modulePath);
  const { observation, record } = createObservation();
  const subscription = await parcel.subscribe(directory, (error, events) => {
    if (error !== null) {
      throw error;
    }
    for (const event of events) {
      record(event.type, path.relative(directory, event.path));
    }
  });
  open.push(() => subscription.unsubscribe());
  return observation;
}

async function runProducer(script: string, ...args: readonly string[]): Promise<void> {
  const child = spawn(process.execPath, ['-e', script, ...args], { stdio: 'ignore' });
  const exit: unknown[] = await once(child, 'exit');
  expect(exit[0]).toBe(0);
}

async function readQueueLimit(): Promise<number> {
  return Number((await readFile(QUEUE_LIMIT_FILE, 'utf8')).trim());
}

function mayHaveOverflowed(delivered: number, queueLimit: number): boolean {
  return delivered >= queueLimit;
}

function countMatching(names: ReadonlySet<string>, pattern: RegExp): number {
  return [...names].filter((name) => pattern.test(name)).length;
}

async function seedFilesWhileBlocked(directory: string, count: number): Promise<void> {
  await mkdir(directory, { recursive: true });
  const result = spawnSync(process.execPath, ['-e', PRODUCER_SCRIPT, directory, String(count)], {
    stdio: 'ignore',
  });
  expect(result.status).toBe(0);
}

async function seedFiles(directory: string, count: number): Promise<readonly string[]> {
  await mkdir(directory, { recursive: true });
  const names = Array.from({ length: count }, (_unused, index) => 'f' + String(index));
  await runProducer(PRODUCER_SCRIPT, directory, String(count));
  return names;
}

function portableScenarios(start: (directory: string) => Promise<Observation>): void {
  it('reports every path of a new nested file', async () => {
    const watched = await start(root);
    await mkdir(path.join(root, 'a/b'), { recursive: true });
    await writeFile(path.join(root, 'a/b/file.txt'), 'x');
    await watched.waitFor('a/b/file.txt');
    expect(watched.names).toContain('a/b/file.txt');
  });

  it('reports both names of a renamed file without pairing them', async () => {
    await writeFile(path.join(root, 'old.txt'), 'x');
    const watched = await start(root);
    await rename(path.join(root, 'old.txt'), path.join(root, 'new.txt'));
    await watched.settle();
    expect(watched.names).toContain('old.txt');
    expect(watched.names).toContain('new.txt');
    expect(watched.kinds.get('old.txt')).toEqual(watched.kinds.get('new.txt'));
  });

  it('reports a write inside a renamed directory under the new path', async () => {
    await mkdir(path.join(root, 'src/inner'), { recursive: true });
    const watched = await start(root);
    await rename(path.join(root, 'src'), path.join(root, 'dst'));
    await watched.settle();
    await writeFile(path.join(root, 'dst/inner/after.txt'), 'x');
    await watched.waitFor('dst/inner/after.txt');
    expect(watched.names).toContain('dst/inner/after.txt');
  });

  it('reports every file of a deep delete', async () => {
    await runProducer(NESTED_PRODUCER_SCRIPT, root, '20', '100');
    const watched = await start(root);
    await rm(path.join(root, 'tree'), { recursive: true });
    await watched.settle();
    expect(countMatching(watched.names, /^tree\/d\d+\/sub\/f\d+$/)).toBe(2000);
  });

  it('reports files an external process writes into directories it just created', async () => {
    const watched = await start(root);
    await runProducer(NESTED_PRODUCER_SCRIPT, root, '50', '40');
    await watched.settle();
    expect(countMatching(watched.names, /^tree\/d\d+\/sub\/f\d+$/)).toBe(2000);
  });

  it('reports every file of a burst of 10000 files', async () => {
    const watched = await start(root);
    const names = await seedFiles(path.join(root, 'burst'), 10000);
    await watched.settle();
    expect(names.filter((name) => !watched.names.has(`burst/${name}`))).toEqual([]);
  });
}

describe.skipIf(process.platform !== 'linux')(
  'built-in recursive fs.watch on Linux (inotify)',
  () => {
    portableScenarios(watchNative);

    it('delivers fewer events than the kernel queue holds for a burst that fits', async () => {
      const watched = await watchNative(root);
      await seedFiles(path.join(root, 'burst'), 10000);
      await watched.settle();
      expect(mayHaveOverflowed(watched.delivered(), await readQueueLimit())).toBe(false);
    });

    it('loses events silently when a burst exceeds the kernel queue and the delivered count exposes it', async () => {
      const queueLimit = await readQueueLimit();
      const produced = queueLimit * 2;
      const watched = await watchNative(root);
      await seedFilesWhileBlocked(path.join(root, 'burst'), produced);
      while (watched.delivered() < queueLimit) {
        await setImmediate();
      }
      await watched.settle();
      expect(countMatching(watched.names, /^burst\/f\d+$/)).toBeLessThan(produced);
      expect(mayHaveOverflowed(watched.delivered(), queueLimit)).toBe(true);
    });

    it('reports a replaced directory and its new file', async () => {
      await mkdir(path.join(root, 'x'));
      await writeFile(path.join(root, 'x/f'), '1');
      const watched = await watchNative(root);
      await rm(path.join(root, 'x'), { recursive: true });
      await mkdir(path.join(root, 'x'));
      await writeFile(path.join(root, 'x/f'), '2');
      await watched.settle();
      expect(watched.names).toContain('x/f');
    });
  },
);

describe.skipIf(process.platform !== 'win32')(
  'built-in recursive fs.watch on Windows (ReadDirectoryChangesW)',
  () => {
    portableScenarios(watchNative);
  },
);

describe.skipIf(process.platform !== 'darwin')(
  'built-in recursive fs.watch on macOS (FSEvents)',
  () => {
    portableScenarios(watchNative);

    it('reports a decomposed file name that normalises to the composed name', async () => {
      const watched = await watchNative(root);
      await writeFile(path.join(root, 'café.txt'), 'x');
      await watched.settle();
      const normalised = [...watched.names].map((name) => name.normalize('NFC'));
      expect(normalised).toContain('café.txt');
    });
  },
);

const parcelCandidate = path.resolve(
  import.meta.dirname,
  '../../../../../tmp/drive-S2/parcel/node_modules/@parcel/watcher/index.js',
);
const parcelModule = existsSync(parcelCandidate) ? parcelCandidate : '';

describe.skipIf(process.platform !== 'linux' || parcelModule === '')(
  '@parcel/watcher on Linux (comparison only)',
  () => {
    const start = (directory: string): Promise<Observation> => watchParcel(parcelModule, directory);

    it('misses files an external process writes into directories it just created', async () => {
      const watched = await start(root);
      await runProducer(NESTED_PRODUCER_SCRIPT, root, '50', '40');
      await watched.settle();
      expect(countMatching(watched.names, /^tree\/d\d+\/sub\/f\d+$/)).toBeLessThan(2000);
    });

    it('misses a write inside a renamed directory', async () => {
      await mkdir(path.join(root, 'src/inner'), { recursive: true });
      const watched = await start(root);
      await rename(path.join(root, 'src'), path.join(root, 'dst'));
      await watched.settle();
      await writeFile(path.join(root, 'dst/inner/after.txt'), 'x');
      await watched.settle();
      expect(watched.names).not.toContain('dst/inner/after.txt');
    });

    it('keeps every file of a burst larger than the kernel queue', async () => {
      const queueLimit = await readQueueLimit();
      const produced = queueLimit * 2;
      const watched = await start(root);
      await seedFiles(path.join(root, 'burst'), produced);
      await watched.settle();
      expect(countMatching(watched.names, /^burst\/f\d+$/)).toBe(produced);
    });
  },
);
