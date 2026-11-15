import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertLoopback,
  NonLoopbackError,
  ProductionPathError,
  scratchPaths,
  SENTINEL,
} from './guard.ts';
import { environmentSecrets, redact, scanFolder, textLeaks } from './leaks.ts';
import { Random, seeded } from './random.ts';
import { MINIMUMS, shortfalls } from './minimums.ts';

describe('the test Hub guard', () => {
  let scratch = '';
  let home = '';
  let root = '';

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'test-hub-guard-'));
    home = join(scratch, 'home');
    root = join(scratch, 'area');
    await mkdir(home, { recursive: true });
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('accepts a plain name inside the test area', () => {
    const paths = scratchPaths({ name: 'run-1', environment: {}, home, root });
    expect(paths.base).toBe(join(root, 'run-1'));
    expect(paths.data).toBe(join(root, 'run-1', 'data'));
  });

  it('refuses names that are not plain', () => {
    for (const name of ['../escape', 'a/b', '', 'UPPER', '.hidden', 'x'.repeat(60)])
      expect(() => scratchPaths({ name, environment: {}, home, root })).toThrow(
        ProductionPathError,
      );
  });

  it('refuses a data pointer that points at production', () => {
    const production = join(home, '.config', 'SmartEverything-Hub');
    expect(() =>
      scratchPaths({
        name: 'x',
        environment: { SMARTEVERYTHING_HUB_HOME: production },
        home,
        root,
      }),
    ).toThrow(/outside the test area/u);
    expect(() =>
      scratchPaths({
        name: 'x',
        environment: { SMARTEVERYTHING_DATA_DIRECTORY: join(home, '.config', 'SmartEverything') },
        home,
        root,
      }),
    ).toThrow(ProductionPathError);
  });

  it('refuses a test area inside or around a production location', () => {
    for (const location of [
      join(home, '.config', 'SmartEverything'),
      join(home, '.config', 'SmartEverything-Hub'),
      join(home, '.local', 'opt', 'SmartEverything-Hub'),
    ])
      expect(() => scratchPaths({ name: 'x', environment: {}, home, root: location })).toThrow(
        /production location/u,
      );
    expect(() =>
      scratchPaths({ name: 'x', environment: {}, home, root: join(home, '.config') }),
    ).not.toThrow();
  });

  it('refuses a folder that already holds files it did not create', async () => {
    await mkdir(join(root, 'taken'));
    await writeFile(join(root, 'taken', 'file.txt'), 'x');
    expect(() => scratchPaths({ name: 'taken', environment: {}, home, root })).toThrow(
      /did not create/u,
    );
    await writeFile(join(root, 'taken', SENTINEL), '{}');
    expect(() => scratchPaths({ name: 'taken', environment: {}, home, root })).not.toThrow();
  });

  it('refuses every address except loopback', () => {
    for (const host of ['0.0.0.0', '192.168.1.5', '::', 'example.com'])
      expect(() => {
        assertLoopback(host);
      }).toThrow(NonLoopbackError);
    expect(() => {
      assertLoopback('127.0.0.1');
    }).not.toThrow();
  });
});

describe('the secret check', () => {
  let folder = '';

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'test-hub-leaks-'));
    await mkdir(join(folder, 'data', 'system', 'keys'), { recursive: true });
    await mkdir(join(folder, 'data', 'files'), { recursive: true });
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('finds key shapes and forbidden values in text', () => {
    expect(textLeaks('token sk-abcdefghijklmnopqrstuvwx', [])).not.toHaveLength(0);
    expect(textLeaks('key AIza0123456789abcdefghijklmnopqrstuvwxyz', [])).not.toHaveLength(0);
    expect(textLeaks('nothing here', [])).toHaveLength(0);
    expect(textLeaks('Petropavlovsk-Kamchatsky Aleksandrovsk-Sakhalinsky', [])).toHaveLength(0);
    expect(textLeaks('has hunter2-secret inside', ['hunter2-secret'])).toHaveLength(1);
  });

  it('reads secret-looking environment values and ignores short ones', () => {
    const found = environmentSecrets({ API_KEY: 'abcdefgh12345', PATH: '/bin', DB_PASSWORD: 'x' });
    expect(found).toEqual(['abcdefgh12345']);
  });

  it('scans seeded files, skips the Hub key folder and reports the file', async () => {
    await writeFile(
      join(folder, 'data', 'system', 'keys', 'owner-token'),
      'real-looking-value-123',
    );
    await writeFile(join(folder, 'data', 'files', 'clean.txt'), 'plain synthetic text');
    expect(await scanFolder(folder, join(folder, 'data'), ['real-looking-value-123'])).toEqual([]);
    await writeFile(join(folder, 'data', 'files', 'leaky.txt'), 'oops real-looking-value-123 oops');
    const leaks = await scanFolder(folder, join(folder, 'data'), ['real-looking-value-123']);
    expect(leaks.map((leak) => leak.file)).toEqual([join('data', 'files', 'leaky.txt')]);
  });

  it('redacts secrets from printed output', () => {
    expect(redact('url ok token=abc12345 end', ['abc12345'])).toBe('url ok token=[redacted] end');
    expect(redact('same', [])).toBe('same');
  });
});

describe('the generators', () => {
  it('draws the same numbers from the same seed and label', () => {
    const first = seeded(7, 'a');
    const second = seeded(7, 'a');
    expect(Array.from({ length: 5 }, () => first.int(0, 1000))).toEqual(
      Array.from({ length: 5 }, () => second.int(0, 1000)),
    );
    expect(new Random(1).next()).not.toBe(new Random(2).next());
  });

  it('reports every count that falls short of its minimum', () => {
    expect(shortfalls(MINIMUMS)).toEqual([]);
    expect(shortfalls({ ...MINIMUMS, devices: 3 })).toEqual(['devices: 3 is below 40']);
  });
});
