import type { BottleCurve } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CLASSIFIER,
  classifyReadings,
  curveFor,
  signalQualityOf,
  type ClassifierRow,
} from '../../src';

const LINEAR: BottleCurve = {
  coefficients: [0, 0, 0, -1, 1000],
  tofMaxMm: 1100,
  maxMl: 1000,
};

const NOW = new Date('2026-10-18T12:00:00Z');

const T0 = Date.parse('2026-10-18T08:00:00Z') / 1000;

function row(minute: number, ml: number, extra: Partial<ClassifierRow> = {}): ClassifierRow {
  return { at: T0 + minute * 60, trigger: 'cap', distanceMm: 1000 - ml, kcps: 6000, ...extra };
}

function events(rows: readonly ClassifierRow[]): readonly string[] {
  return classifyReadings(rows, LINEAR, EMPTY_CLASSIFIER, NOW).rows.map(
    (item) => `${item.verdict}:${item.event.kind}`,
  );
}

describe('LARQ drink and fill detection', () => {
  it('uses the first reading only to learn the level', () => {
    expect(events([row(0, 400)])).toStrictEqual(['accepted:seed']);
  });

  it('counts a drop of more than 15 ml as a drink of that size', () => {
    const { rows } = classifyReadings([row(0, 400), row(10, 330)], LINEAR, EMPTY_CLASSIFIER, NOW);
    expect(rows[1]?.event).toStrictEqual({ kind: 'drink', ml: 70 });
    expect(rows[1]?.volumeMl).toBe(330);
  });

  it('does not count a drop of exactly 15 ml', () => {
    expect(events([row(0, 400), row(10, 385)])).toStrictEqual(['accepted:seed', 'accepted:small']);
  });

  it('adds up small drops against the last counted level until they are a drink', () => {
    const { rows } = classifyReadings(
      [row(0, 400), row(5, 394), row(10, 388), row(15, 382)],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(rows.map((item) => item.event.kind)).toStrictEqual(['seed', 'small', 'small', 'drink']);
    expect(rows[3]?.event).toStrictEqual({ kind: 'drink', ml: 18 });
  });

  it('calls a rise of more than 100 ml a fill, which is never a drink', () => {
    const { rows } = classifyReadings([row(0, 200), row(30, 560)], LINEAR, EMPTY_CLASSIFIER, NOW);
    expect(rows[1]?.event).toStrictEqual({ kind: 'fill', fromMl: 200, toMl: 560, drunkMl: 0 });
  });

  it('does not call a rise of exactly 100 ml a fill', () => {
    expect(events([row(0, 200), row(30, 300)])).toStrictEqual(['accepted:seed', 'accepted:small']);
  });

  it('credits what was drunk below the last counted level before a fill', () => {
    const { rows } = classifyReadings(
      [row(0, 400), row(5, 392), row(30, 590)],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(rows[2]?.event).toStrictEqual({ kind: 'fill', fromMl: 392, toMl: 590, drunkMl: 8 });
  });

  it('keeps counting from the new level after a fill', () => {
    const { rows } = classifyReadings(
      [row(0, 200), row(30, 560), row(40, 500)],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(rows[2]?.event).toStrictEqual({ kind: 'drink', ml: 60 });
  });

  it('counts from the new level after a rise too small to be a fill', () => {
    const { rows } = classifyReadings(
      [row(0, 400), row(10, 330), row(30, 400), row(40, 380)],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(rows.map((item) => item.event)).toStrictEqual([
      { kind: 'seed' },
      { kind: 'drink', ml: 70 },
      { kind: 'small' },
      { kind: 'drink', ml: 20 },
    ]);
  });

  it('does not move the counted level for a rise of exactly 15 ml', () => {
    const { rows } = classifyReadings(
      [row(0, 400), row(10, 415), row(20, 395)],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(rows.map((item) => item.event.kind)).toStrictEqual(['seed', 'small', 'small']);
  });

  it('counts real sips after a refill whose reading had a weak signal', () => {
    const sip = 'cap_on_flap_open_sip';
    const real = (at: number, distanceMm: number, kcps: number, trigger = sip): ClassifierRow => ({
      at,
      trigger,
      distanceMm,
      kcps,
    });
    const { rows } = classifyReadings(
      [
        real(1792186277, 103, 130),
        real(1792186324, 113, 71),
        real(1792290894, 71, 64, 'cap'),
        real(1792330342, 83, 202),
        real(1792330360, 89, 206),
        real(1792330411, 94, 378),
      ],
      curveFor(680, null),
      EMPTY_CLASSIFIER,
      new Date('2026-10-18T14:00:00Z'),
    );
    expect(rows.map((item) => [item.verdict, item.volumeMl, item.event])).toStrictEqual([
      ['accepted', 354, { kind: 'seed' }],
      ['weak', 321, { kind: 'none' }],
      ['weak', 478, { kind: 'none' }],
      ['accepted', 429, { kind: 'small' }],
      ['accepted', 405, { kind: 'drink', ml: 23 }],
      ['accepted', 386, { kind: 'drink', ml: 19 }],
    ]);
  });

  it('continues from the state a previous sync left behind', () => {
    const first = classifyReadings([row(0, 400), row(10, 330)], LINEAR, EMPTY_CLASSIFIER, NOW);
    const second = classifyReadings([row(20, 270)], LINEAR, first.state, NOW);
    expect(second.rows[0]?.event).toStrictEqual({ kind: 'drink', ml: 60 });
  });
});

describe('LARQ readings that must not count', () => {
  it('ignores a reading beyond the sensor range and keeps the state', () => {
    const { rows, state } = classifyReadings(
      [row(0, 400), row(5, 400, { distanceMm: 1100 })],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(rows[1]).toMatchObject({ verdict: 'out_of_range', volumeMl: null });
    expect(state.lastCounted).toBe(400);
  });

  it('ignores a reading stamped before 2024 or more than five minutes ahead', () => {
    const early = row(0, 400, { at: Date.parse('2023-12-31T23:59:59Z') / 1000 });
    const late = row(1, 400, { at: NOW.getTime() / 1000 + 301 });
    const justOk = row(2, 400, { at: NOW.getTime() / 1000 + 300 });
    expect(events([early, late, justOk])).toStrictEqual([
      'clock_invalid:none',
      'clock_invalid:none',
      'accepted:seed',
    ]);
  });

  it('rejects a weak reading that jumps away from both neighbours', () => {
    const rows = [row(0, 400), row(5, 250, { kcps: 50 }), row(10, 400)];
    expect(events(rows)).toStrictEqual(['accepted:seed', 'weak:none', 'accepted:small']);
  });

  it('keeps a weak reading when the next reading agrees with it', () => {
    const rows = [row(0, 400), row(5, 300, { kcps: 50 }), row(10, 300)];
    expect(events(rows)).toStrictEqual(['accepted:seed', 'accepted:drink', 'accepted:small']);
  });

  it('keeps a weak reading that stays close to the one before it', () => {
    expect(events([row(0, 400), row(5, 396, { kcps: 50 }), row(10, 300)])[1]).toBe(
      'accepted:small',
    );
  });

  it('leaves a weak last reading that jumps undecided until the next one arrives', () => {
    const result = classifyReadings(
      [row(0, 400), row(5, 250, { kcps: 50 })],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(result.rows.map((item) => item.verdict)).toStrictEqual(['accepted']);
    expect(result.undecided).toMatchObject({ distanceMm: 750 });
    expect(result.state.lastCounted).toBe(400);
  });

  it('decides a weak reading once the next one is known, whichever call it arrives in', () => {
    const first = classifyReadings(
      [row(0, 400), row(5, 330, { kcps: 50 })],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    const second = classifyReadings(
      [row(5, 330, { kcps: 50 }), row(10, 330)],
      LINEAR,
      first.state,
      NOW,
    );
    expect(second.undecided).toBeNull();
    expect(second.rows.map((item) => `${item.verdict}:${item.event.kind}`)).toStrictEqual([
      'accepted:drink',
      'accepted:small',
    ]);
  });

  it('does not hold back a last reading with a low signal that stays close', () => {
    const result = classifyReadings(
      [row(0, 400), row(5, 396, { kcps: 50 })],
      LINEAR,
      EMPTY_CLASSIFIER,
      NOW,
    );
    expect(result.undecided).toBeNull();
    expect(result.rows).toHaveLength(2);
  });

  it('does not reject a low signal that is not a jump', () => {
    expect(events([row(0, 400), row(5, 399, { kcps: 10 })])[1]).toBe('accepted:small');
  });

  it('rejects the closed-cap reading after a fill when the water was still moving', () => {
    const rows = [
      row(0, 200),
      row(30, 560),
      row(31, 540, { trigger: 'cap' }),
      row(32, 560, { trigger: 'cap_on_flap' }),
    ];
    expect(events(rows)).toStrictEqual([
      'accepted:seed',
      'accepted:fill',
      'slosh:none',
      'accepted:small',
    ]);
  });

  it('keeps the closed-cap reading after a fill when it agrees with the flap reading', () => {
    const rows = [
      row(0, 200),
      row(30, 560),
      row(31, 557, { trigger: 'cap' }),
      row(32, 560, { trigger: 'cap_on_flap_open_sip' }),
    ];
    expect(events(rows)[2]).toBe('accepted:small');
  });

  it('does not call slosh without a fill before it or a flap reading after it', () => {
    expect(
      events([
        row(0, 400),
        row(1, 380, { trigger: 'cap' }),
        row(2, 400, { trigger: 'cap_on_flap' }),
      ])[1],
    ).toBe('accepted:drink');
    expect(
      events([
        row(0, 200),
        row(30, 560),
        row(31, 550, { trigger: 'cap' }),
        row(32, 550, { trigger: 'interval' }),
      ])[2],
    ).toBe('accepted:small');
    expect(events([row(0, 200), row(30, 560), row(31, 550, { trigger: 'cap' })])[2]).toBe(
      'accepted:small',
    );
    expect(
      events([
        row(0, 200),
        row(30, 560),
        row(31, 550, { trigger: 'interval' }),
        row(32, 560, { trigger: 'cap_on_flap' }),
      ])[2],
    ).toBe('accepted:small');
  });
});

describe('LARQ signal quality', () => {
  it('grades the signal rate as good above 5000, acceptable from 1000 and weak below', () => {
    expect(signalQualityOf(5001)).toBe('good');
    expect(signalQualityOf(5000)).toBe('acceptable');
    expect(signalQualityOf(1000)).toBe('acceptable');
    expect(signalQualityOf(999)).toBe('weak');
  });
});
