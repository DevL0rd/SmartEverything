import { describe, expect, it } from 'vitest';
import { QUARTER_SHAPES, frontOf, toothPath } from './arch-geometry';
import {
  TEETH_WIDTHS,
  archLabel,
  centreLines,
  partialLabel,
  quartersOf,
  reachedCount,
  targetsOf,
  toothFills,
  type ArchInput,
} from './arch-model';

const TARGETS = [30, 30, 30, 30] as const;

function input(patch: Partial<ArchInput>): ArchInput {
  return {
    zoneSeconds: [0, 0, 0, 0],
    targets: TARGETS,
    current: null,
    finished: false,
    pacerOn: true,
    ...patch,
  };
}

describe('the quarter targets', () => {
  it('takes the handle pacer when it times four quarters', () => {
    expect(targetsOf([20, 25, 30, 35, 0, 0, 0, 0], 120)).toEqual([20, 25, 30, 35]);
  });

  it('falls back to a quarter of the routine, then to thirty seconds', () => {
    expect(targetsOf(null, 100)).toEqual([25, 25, 25, 25]);
    expect(targetsOf([30, 30, 0, 0], null)).toEqual([30, 30, 30, 30]);
  });
});

describe('the quarter fill', () => {
  it('fills in proportion to the real seconds over the target', () => {
    const [quarter] = quartersOf(input({ zoneSeconds: [18, 0, 0, 0], current: 1 }));
    expect(quarter?.fill).toBeCloseTo(0.6);
    expect(quarter?.state).toBe('current');
  });

  it('caps a quarter at full and marks it done once the brush moved on', () => {
    const quarters = quartersOf(input({ zoneSeconds: [45, 12, 0, 0], current: 2 }));
    expect(quarters[0]).toMatchObject({ fill: 1, state: 'done' });
    expect(quarters[1]).toMatchObject({ state: 'current' });
    expect(quarters[2]).toMatchObject({ state: 'todo' });
  });

  it('counts a quarter shown as 0:30 of 0:30 as done, never as partly brushed', () => {
    const quarters = quartersOf(input({ zoneSeconds: [29.5, 29.6, 29.4, 30], finished: true }));
    expect(quarters.map((quarter) => quarter.state)).toEqual(['done', 'done', 'partial', 'done']);
    expect(quarters.map(partialLabel)).toEqual([null, null, '0:29 of 0:30', null]);
  });

  it('keeps a finished session honest: done, partial and never reached', () => {
    const quarters = quartersOf(input({ zoneSeconds: [30, 18, 0, 0], finished: true }));
    expect(quarters.map((quarter) => quarter.state)).toEqual([
      'done',
      'partial',
      'missed',
      'missed',
    ]);
    expect(reachedCount(quarters)).toBe(1);
    expect(partialLabel(quarters[1] ?? fail())).toBe('0:18 of 0:30');
    expect(partialLabel(quarters[0] ?? fail())).toBeNull();
  });

  it('draws a quarter left unfinished mid session as partial', () => {
    const quarters = quartersOf(input({ zoneSeconds: [30, 10, 5, 0], current: 3 }));
    expect(quarters.map((quarter) => quarter.state)).toEqual([
      'done',
      'partial',
      'current',
      'todo',
    ]);
  });

  it('shows a neutral arch when the pacer is off', () => {
    const quarters = quartersOf(input({ pacerOn: false, zoneSeconds: [30, 0, 0, 0] }));
    expect(new Set(quarters.map((quarter) => quarter.state))).toEqual(new Set(['idle']));
    expect(archLabel(quarters, false)).toContain('pacer is off');
  });

  it('never goes negative or past full', () => {
    const quarters = quartersOf(input({ zoneSeconds: [-4, 500, 0, 0] }));
    expect(quarters[0]?.fill).toBe(0);
    expect(quarters[1]?.fill).toBe(1);
  });
});

describe('the tooth fill', () => {
  it('lights the back molar first and weighs teeth by width', () => {
    const half = toothFills(0.5);
    const total = TEETH_WIDTHS.reduce((sum, width) => sum + width, 0);
    const lit = half.reduce((sum, share, index) => sum + share * (TEETH_WIDTHS[index] ?? 0), 0);
    expect(lit).toBeCloseTo(total / 2);
    expect(half[0]).toBe(1);
    expect(half[6]).toBe(0);
  });

  it('lights nothing at zero and everything at full', () => {
    expect(toothFills(0).every((share) => share === 0)).toBe(true);
    expect(toothFills(1).every((share) => share === 1)).toBe(true);
    expect(toothFills(9).every((share) => share === 1)).toBe(true);
  });
});

describe('the arch labels', () => {
  it('reads the state of every quarter', () => {
    const quarters = quartersOf(input({ zoneSeconds: [30, 12, 0, 0], current: 2 }));
    const label = archLabel(quarters, false);
    expect(label).toContain('Upper left done');
    expect(label).toContain('Upper right now, 0:12 of 0:30');
    expect(label).toContain('Lower left to do');
  });

  it('writes the quarter once in the centre', () => {
    const quarters = quartersOf(input({ zoneSeconds: [30, 12, 0, 0], current: 2 }));
    expect(
      centreLines({ elapsedS: 42, routineS: 120, current: 2, finished: false, quarters }),
    ).toEqual({ big: '0:42', small: 'of 2:00 · quarter 2 of 4' });
    expect(
      centreLines({ elapsedS: 118, routineS: 120, current: null, finished: true, quarters }),
    ).toEqual({ big: '1:58', small: '1 of 4 quarters' });
  });
});

describe('the arch geometry', () => {
  it('has seven teeth in each of four quarters with a visible midline gap', () => {
    expect(QUARTER_SHAPES).toHaveLength(4);
    for (const shape of QUARTER_SHAPES) {
      expect(shape.teeth).toHaveLength(7);
    }
    const upperLeft = QUARTER_SHAPES[0]?.teeth.at(-1)?.outer[1];
    const upperRight = QUARTER_SHAPES[1]?.teeth.at(-1)?.outer[1];
    expect(Math.abs((upperRight?.[0] ?? 0) - (upperLeft?.[0] ?? 0))).toBeGreaterThan(2);
  });

  it('makes molars deeper than incisors', () => {
    const teeth = QUARTER_SHAPES[0]?.teeth ?? [];
    const depth = (index: number): number => {
      const tooth = teeth[index];
      return tooth === undefined
        ? 0
        : Math.hypot(tooth.outer[0][0] - tooth.inner[0][0], tooth.outer[0][1] - tooth.inner[0][1]);
    };
    expect(depth(0)).toBeGreaterThan(depth(6));
  });

  it('draws a partial tooth shorter than a full one', () => {
    const tooth = QUARTER_SHAPES[0]?.teeth[0];
    expect(tooth).toBeDefined();
    if (tooth !== undefined) {
      expect(toothPath(tooth, 0.5)).not.toBe(toothPath(tooth));
    }
  });

  it('puts the marker at the front of what is lit', () => {
    const teeth = QUARTER_SHAPES[0]?.teeth ?? [];
    const early = frontOf(teeth, toothFills(0.1));
    const late = frontOf(teeth, toothFills(0.9));
    expect(Math.abs(late[0] - (teeth[0]?.outer[0][0] ?? 0))).toBeGreaterThan(
      Math.abs(early[0] - (teeth[0]?.outer[0][0] ?? 0)),
    );
  });
});

function fail(): never {
  throw new Error('expected a quarter');
}
