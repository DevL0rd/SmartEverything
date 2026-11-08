import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reverseV1 } from '../../src/data-layout/migrate-v1/reverse';
import {
  JOURNAL_FILE,
  readJournal,
  statOrUndefined,
} from '../../src/data-layout/migrate-v1/journal';
import { runV1Renames, type StepEvent } from '../../src/data-layout/migrate-v1/renames';
import { HUB_ENTRIES, KEPT_ENTRIES, writeLiveListing } from './fixtures/live-listing';

let work: string;
let root: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'layout-v1-'));
  root = join(work, 'data');
  await mkdir(root);
  await writeLiveListing(root);
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function snapshot(base: string, current = base): Promise<readonly string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    const name = relative(base, path);
    if (entry.isDirectory()) {
      const inner = await snapshot(base, path);
      lines.push(inner.length === 0 ? `${name}/` : '', ...inner);
    } else {
      lines.push(`${name}=${await readFile(path, 'utf8')}`);
    }
  }
  return lines.filter((line) => line !== '').sort();
}

async function exists(path: string): Promise<boolean> {
  return (await statOrUndefined(path)) !== undefined;
}

class Crash extends Error {}

async function crashAt(target: string, phase: StepEvent['phase'], at: number): Promise<void> {
  await expect(
    runV1Renames(target, {
      observe: (event) => {
        if (event.phase === phase && event.index === at) {
          throw new Crash('injected');
        }
      },
    }),
  ).rejects.toBeInstanceOf(Crash);
}

describe('layout v1 rename engine', () => {
  it('lands every hub entry at its v1 place', async () => {
    const report = await runV1Renames(root);
    for (const entry of HUB_ENTRIES) {
      expect(await readFile(join(root, ...entry.v1.split('/')), 'utf8')).toBe(entry.legacy);
      expect(await exists(join(root, ...entry.legacy.split('/')))).toBe(false);
    }
    for (const path of KEPT_ENTRIES) {
      expect(await readFile(join(root, ...path.split('/')), 'utf8')).toBe(path);
    }
    expect(report.orphans).toEqual(['service-ready.json.879981']);
    expect(report.unclassified).toEqual([]);
  });

  it('leaves no legacy top-level name behind', async () => {
    await runV1Renames(root);
    const top = (await readdir(root)).sort();
    const expected = new Set([
      'system',
      'home',
      'people',
      'cache',
      'backups',
      'server.lock',
      'tmp',
    ]);
    expect(top.every((name) => expected.has(name))).toBe(true);
  });

  it('keeps orphan database groups in legacy-database', async () => {
    await runV1Renames(root);
    const kept = await readdir(join(root, 'backups', 'legacy-database'));
    expect(kept).toContain('smarteverything.db.pre-migration-7-wal');
    expect(kept).toContain('smarteverything.db.pre-migration-7-shm');
    expect(await readdir(join(root, 'system', 'database'))).toEqual([
      'smarteverything.db',
      'smarteverything.db-shm',
      'smarteverything.db-wal',
    ]);
  });

  it('records the stray in the journal and marks it complete', async () => {
    await runV1Renames(root);
    const journal = await readJournal(root);
    expect(journal?.complete).toBe(true);
    expect(JOURNAL_FILE).toBe('system/migration/layout-1.json');
    expect(journal?.steps.every((step) => step.status === 'done')).toBe(true);
  });

  it('is a no-op when run again', async () => {
    await runV1Renames(root);
    const before = await snapshot(root);
    await runV1Renames(root);
    expect(await snapshot(root)).toEqual(before);
  });

  it('resumes to the same tree after a crash at every step and phase', async () => {
    await runV1Renames(root);
    const expected = await snapshot(root);
    const steps = (await readJournal(root))?.steps.length ?? 0;
    const template = join(work, 'template');
    await rm(root, { recursive: true });
    await mkdir(template);
    await writeLiveListing(template);
    for (const phase of ['started', 'renamed', 'done'] as const) {
      for (let index = 0; index < steps; index += 1) {
        const target = join(work, `crash-${phase}-${String(index)}`);
        await cp(template, target, { recursive: true });
        await crashAt(target, phase, index);
        await runV1Renames(target);
        expect(await snapshot(target)).toEqual(expected);
        await rm(target, { recursive: true });
      }
    }
  }, 300_000);

  it('reverses to the original names exactly', async () => {
    const original = await snapshot(root);
    await runV1Renames(root);
    await reverseV1(root);
    expect(await snapshot(root)).toEqual(original);
    expect(await exists(join(root, 'system'))).toBe(false);
  });

  it('reverses a half-finished run', async () => {
    const original = await snapshot(root);
    await crashAt(root, 'renamed', 40);
    await reverseV1(root);
    expect(await snapshot(root)).toEqual(original);
  });

  it('resumes a reverse that crashed', async () => {
    const original = await snapshot(root);
    await runV1Renames(root);
    let calls = 0;
    await expect(
      reverseV1(root, {
        rename: async (from, to) => {
          calls += 1;
          if (calls === 10) {
            throw new Crash('injected');
          }
          await rename(from, to);
        },
      }),
    ).rejects.toBeInstanceOf(Crash);
    await reverseV1(root);
    expect(await snapshot(root)).toEqual(original);
  });

  it('refuses to move across volumes with a clear error', async () => {
    const cross = Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    await expect(
      runV1Renames(root, {
        rename: () => {
          throw cross;
        },
      }),
    ).rejects.toThrow(/different volumes/);
  });

  it('refuses before moving anything when a v1 target already exists', async () => {
    await mkdir(join(root, 'system', 'keys'), { recursive: true });
    await writeFile(join(root, 'system', 'keys', 'owner-token'), 'taken');
    const before = await snapshot(root);
    await expect(runV1Renames(root)).rejects.toThrow(/already exists/);
    expect(await snapshot(root)).toEqual(before);
    expect(await exists(join(root, JOURNAL_FILE))).toBe(false);
  });

  it('reports unknown non-hub names without moving them', async () => {
    await writeFile(join(root, 'mystery.txt'), 'x');
    const report = await runV1Renames(root);
    expect(report.unclassified).toEqual(['mystery.txt']);
    expect(await readFile(join(root, 'mystery.txt'), 'utf8')).toBe('x');
  });
});
