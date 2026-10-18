import { runInNewContext } from 'node:vm';
import { getHeapSpaceStatistics, setFlagsFromString } from 'node:v8';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FrameTally } from '../../dev/frame-probe';
import { Probe } from './probe';

const WARM_UP = 5000;
const ROUNDS = 5000;
const BUDGET_BYTES = 8 * ROUNDS;

setFlagsFromString('--expose-gc');
const collectGarbage: unknown = runInNewContext('gc');
const GARBAGE_ARGS: readonly unknown[] = [];

function youngBytes(): number {
  if (typeof collectGarbage === 'function') {
    Reflect.apply(collectGarbage, undefined, GARBAGE_ARGS);
  }
  return (
    getHeapSpaceStatistics().find((space) => space.space_name === 'new_space')?.space_used_size ?? 0
  );
}

function allocated(work: (round: number) => void): number {
  for (let round = 0; round < WARM_UP; round += 1) {
    work(round);
  }
  const before = youngBytes();
  for (let round = 0; round < ROUNDS; round += 1) {
    work(round);
  }
  const after = getHeapSpaceStatistics().find((space) => space.space_name === 'new_space');
  return (after?.space_used_size ?? 0) - before;
}

const SLICES = 14;

function stateWith(
  changed: readonly string[],
  base: Record<string, object>,
): Record<string, object> {
  const next = { ...base };
  changed.forEach((key) => {
    next[key] = {};
  });
  return next;
}

describe('probe hot path', () => {
  const probe = new Probe();
  const tally = new FrameTally();
  const previous: Record<string, object> = {};

  beforeAll(() => {
    vi.stubGlobal('performance', { now: () => 5 });
    for (let slice = 0; slice < SLICES; slice += 1) {
      previous[`slice${String(slice)}`] = {};
    }
    probe.screen('home');
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('adds no allocation per live notice, frame or commit in the sampler window', () => {
    const bytes = allocated((round) => {
      tally.notices += 1;
      tally.commit(2);
      tally.tick(round % 60);
    });
    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });

  it('adds no allocation per store notice after warm-up', () => {
    const nexts = [stateWith(['slice3', 'slice7'], previous), stateWith(['slice1'], previous)];
    const bytes = allocated((round) => {
      probe.store(previous, nexts[round & 1] ?? previous, 4);
    });
    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });

  it('adds no allocation per commit, frame, action, parse or scroll event after warm-up', () => {
    const bytes = allocated((round) => {
      probe.screenCommit('home', 'update', 2);
      probe.record('row', 1, false);
      probe.frame(16 + (round % 3), round, round + 16);
      probe.json(1, 500);
      probe.action('tap', 'x');
      probe.touch('move');
      probe.listScroll('chat', round);
    });
    expect(bytes).toBeLessThan(BUDGET_BYTES);
  });
});
