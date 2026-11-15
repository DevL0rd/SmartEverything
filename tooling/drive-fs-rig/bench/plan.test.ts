import { describe, expect, it } from 'vitest';
import {
  allWorkloads,
  datasetsFor,
  bestMaxBackground,
  checkSelection,
  maxBackgroundKind,
  parseSweepKind,
  phasesFor,
  schedule,
} from './plan.ts';

describe('schedule', () => {
  it('runs every kind once per run and alternates who goes first', () => {
    const turns = schedule(['nfs', 'se'], 4);
    expect(turns).toHaveLength(8);
    expect(turns.filter((turn) => turn.run === 3).map((turn) => turn.kind)).toEqual(['nfs', 'se']);
    expect(turns.filter((turn) => turn.run === 2).map((turn) => turn.kind)).toEqual(['se', 'nfs']);
    const firsts = turns.filter((_, index) => index % 2 === 0).map((turn) => turn.kind);
    expect(firsts.filter((kind) => kind === 'nfs')).toHaveLength(2);
  });

  it('rotates three kinds so each leads once in three runs', () => {
    const turns = schedule(['a', 'b', 'c'], 3);
    const leaders = turns.filter((_, index) => index % 3 === 0).map((turn) => turn.kind);
    expect(new Set(leaders).size).toBe(3);
  });

  it('keeps a single kind in order', () => {
    expect(schedule(['nfs'], 2)).toEqual([
      { run: 1, kind: 'nfs' },
      { run: 2, kind: 'nfs' },
    ]);
  });
});

describe('phases and selection', () => {
  it('lists the sixteen workloads once each', () => {
    const names = allWorkloads();
    expect(names).toHaveLength(16);
    expect(new Set(names).size).toBe(16);
  });

  it('filters phases to the selection and keeps cold ones first', () => {
    const phases = phasesFor(['create-16', 'seq-read-cold', 'seq-read-warm']);
    expect(phases.cold).toEqual(['seq-read-cold']);
    expect(phases.warm).toEqual(['seq-read-warm']);
    expect(phases.rest).toEqual(['create-16']);
  });

  it('refuses unknown workloads and rm-tree without untar', () => {
    expect(() => {
      checkSelection(['nope']);
    }).toThrow(/Unknown workload/u);
    expect(() => {
      checkSelection(['rm-tree']);
    }).toThrow(/untar/u);
    expect(() => {
      checkSelection(['untar', 'rm-tree']);
    }).not.toThrow();
  });
});

describe('datasetsFor', () => {
  it('prepares only what the selected workloads read', () => {
    expect(datasetsFor(phasesFor(['untar', 'rm-tree', 'seq-write']))).toEqual([]);
    expect(datasetsFor(phasesFor(['seq-read-warm', 'rand-write-1']))).toEqual(['seq', 'rand']);
    expect(datasetsFor(phasesFor(null))).toEqual(['seq', 'rand', 'list', 'office']);
  });
});

describe('MaxBackground sweep', () => {
  it('names and parses sweep kinds', () => {
    expect(maxBackgroundKind(64)).toBe('se-mb64');
    expect(parseSweepKind('se-mb128')).toBe(128);
    expect(parseSweepKind('nfs')).toBeNull();
  });

  it('picks the value with the best geometric mean against the fastest per workload', () => {
    const medians = new Map([
      [
        'seq-read-cold',
        new Map([
          ['se-mb12', 10],
          ['se-mb64', 6],
          ['se-mb128', 6.3],
          ['nfs', 5],
        ]),
      ],
      [
        'create-16',
        new Map([
          ['se-mb12', 20],
          ['se-mb64', 12],
          ['se-mb128', 12.5],
        ]),
      ],
    ]);
    expect(bestMaxBackground(medians)?.value).toBe(64);
  });

  it('returns null when nothing was swept', () => {
    expect(bestMaxBackground(new Map([['untar', new Map([['nfs', 3]])]]))).toBeNull();
  });
});
