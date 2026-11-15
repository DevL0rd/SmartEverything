import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compare, type Entry, type Report } from '../manifest.ts';
import { hubReport, hubSnapshot, settle, type SettleIo, type Snapshot } from './recovery-settle.ts';

const CLEAN: Report = { missing: [], doubled: [], unexpected: [], changed: [], checked: 1 };
const LOST: Report = { ...CLEAN, missing: ['a'] };
const DOUBLED: Report = { ...CLEAN, doubled: ['a (conflict copy)'] };
const LIMITS = { idleMs: 1000, graceMs: 50, pollMs: 100 };

function snapshot(present: number, complete: boolean, signature = String(present)): Snapshot {
  return { present, bytes: present * 10, complete, signature };
}

function pick<T>(items: readonly T[], index: number): T {
  const found = items[Math.min(index, items.length - 1)];
  if (found === undefined) throw new Error('Nothing scripted');
  return found;
}

function clock(): { readonly now: () => number; readonly sleep: (ms: number) => Promise<void> } {
  let time = 0;
  return {
    now: () => time,
    sleep: (ms: number): Promise<void> => {
      time += ms;
      return Promise.resolve();
    },
  };
}

function scripted(
  snapshots: readonly Snapshot[],
  reports: readonly Report[],
): SettleIo & { readonly verified: () => number } {
  const timer = clock();
  let seen = 0;
  let checked = 0;
  return {
    ...timer,
    snapshot: () => Promise.resolve(pick(snapshots, seen++)),
    verify: () => Promise.resolve(pick(reports, checked++)),
    verified: () => checked,
  };
}

describe('settle', () => {
  it('returns the clean report once the Hub holds everything and stays clean through the grace', async () => {
    const io = scripted([snapshot(1, false), snapshot(2, true)], [CLEAN, CLEAN]);
    expect(await settle(io, LIMITS)).toBe(CLEAN);
    expect(io.verified()).toBe(2);
  });

  it('reports a copy that appears during the grace as doubled', async () => {
    const io = scripted([snapshot(2, true)], [CLEAN, DOUBLED]);
    expect(await settle(io, LIMITS)).toBe(DOUBLED);
  });

  it('gives up after the idle time and returns the last failing report', async () => {
    const io = scripted([snapshot(1, false), snapshot(2, true, 'full')], [LOST]);
    expect(await settle(io, LIMITS)).toBe(LOST);
    expect(io.verified()).toBe(1);
  });

  it('keeps waiting while progress continues', async () => {
    const steps = Array.from({ length: 30 }, (_, index) => snapshot(index, false));
    const io = scripted([...steps, snapshot(31, true)], [CLEAN]);
    expect(await settle(io, LIMITS)).toBe(CLEAN);
  });

  it('verifies again only when the complete snapshot changed', async () => {
    const io = scripted(
      [snapshot(2, true, 'one'), snapshot(2, true, 'one'), snapshot(2, true, 'two')],
      [LOST, CLEAN, CLEAN],
    );
    await settle(io, LIMITS);
    expect(io.verified()).toBe(3);
  });
});

describe('hub views', () => {
  async function folder(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'recovery-settle-'));
  }

  const file = (path: string, size: number): Entry => ({
    path,
    type: 'file',
    size,
    sha256: 'a'.repeat(64),
    mode: 0o644,
    linkTarget: null,
  });

  it('counts present files and flags a short file as not complete', async () => {
    const directory = await folder();
    try {
      await mkdir(join(directory, 'd'));
      await writeFile(join(directory, 'd', 'a'), 'abc');
      await writeFile(join(directory, 'd', 'b'), 'x');
      const view = await hubSnapshot(directory, [file('d/a', 3), file('d/b', 2), file('d/c', 1)]);
      expect(view.present).toBe(2);
      expect(view.bytes).toBe(4);
      expect(view.complete).toBe(false);
      const full = await hubSnapshot(directory, [file('d/a', 3), file('d/b', 1)]);
      expect(full.complete).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('changes the signature when a file is rewritten', async () => {
    const directory = await folder();
    try {
      await writeFile(join(directory, 'a'), 'abc');
      const entries = [file('a', 3)];
      const before = await hubSnapshot(directory, entries);
      await utimes(join(directory, 'a'), new Date(), new Date(Date.now() + 5000));
      expect((await hubSnapshot(directory, entries)).signature).not.toBe(before.signature);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports everything lost when the Hub folder does not exist yet', async () => {
    const report = await hubReport(join(tmpdir(), 'recovery-settle-missing'), [file('a', 3)]);
    expect(report.missing).toEqual(['a']);
    expect(compare([], [], { modes: false }).checked).toBe(0);
  });
});
