import { describe, expect, it } from 'vitest';
import {
  attentionOf,
  isPausedByReasons,
  lowestSupply,
  powerStateOf,
  printerSummary,
  problemOf,
  problemsOf,
  reasonSeverity,
  splitReason,
  stateValueOf,
  supplyStandings,
  type SupplyInput,
} from '../src';

function supply(
  key: string,
  slot: SupplyInput['slot'],
  level: number | null,
  extra: Partial<SupplyInput> = {},
): SupplyInput {
  return {
    key,
    slot,
    kind: 'ink',
    consumed: true,
    level,
    lowLevel: null,
    daysLeft: null,
    ...extra,
  };
}

const THRESHOLDS = { thresholds: {} } as const;

describe('printer state reasons', () => {
  it('splits the severity suffix and applies the RFC 8011 rule without one', () => {
    expect(splitReason('media-jam-error')).toEqual({ base: 'media-jam', suffix: 'error' });
    expect(splitReason('toner-low')).toEqual({ base: 'toner-low', suffix: null });
    expect(reasonSeverity('media-low-report', true)).toBe('report');
    expect(reasonSeverity('media-low-warning', true)).toBe('warning');
    expect(reasonSeverity('media-jam', true)).toBe('error');
    expect(reasonSeverity('media-jam', false)).toBe('warning');
  });

  it('turns known reasons into plain problems with the part to highlight', () => {
    expect(problemOf('cover-open', true)).toMatchObject({
      severity: 'error',
      part: 'cover',
      title: 'Cover open',
    });
    expect(problemOf('media-path-input-jam-error', false)).toMatchObject({ part: 'input-path' });
    expect(problemOf('media-path-output-jam', false)).toMatchObject({ part: 'output-path' });
    expect(problemOf('media-jam', true)?.part).toBe('path');
  });

  it('names reasons it does not know and ignores informational ones', () => {
    expect(problemOf('lamp-failure-warning', false)).toMatchObject({
      part: 'none',
      title: 'Lamp failure',
      severity: 'warning',
    });
    expect(problemOf('standby', false)).toBeNull();
    expect(problemOf('media-low-report', false)).toBeNull();
  });

  it('lists each problem once', () => {
    const problems = problemsOf(
      ['media-jam', 'media-path-jam', 'standby', 'cover-open-warning'],
      true,
    );
    expect(problems.map((problem) => problem.title)).toEqual(['Paper jam', 'Cover open']);
  });

  it('reads power and pause from reasons', () => {
    expect(powerStateOf(['none'])).toBe('awake');
    expect(powerStateOf(['standby'])).toBe('standby');
    expect(powerStateOf(['suspend-report'])).toBe('hibernate');
    expect(powerStateOf(['shutdown'])).toBe('off');
    expect(isPausedByReasons(['paused'])).toBe(true);
    expect(isPausedByReasons(['moving-to-paused-report'])).toBe(true);
    expect(isPausedByReasons(['media-low'])).toBe(false);
    expect(stateValueOf('processing')).toBe('printing');
    expect(stateValueOf('idle')).toBe('idle');
  });
});

describe('one low rule for chips, cards, message, widgets and events', () => {
  it('marks a supply low at the printer threshold, the hub threshold or with days left', () => {
    const rows = supplyStandings(
      [
        supply('black', 'black', 14, { lowLevel: 15 }),
        supply('cyan', 'cyan', 40),
        supply('magenta', 'magenta', 20, { daysLeft: 3 }),
        supply('yellow', 'yellow', 18),
        supply('light-cyan', 'light-cyan', null),
        supply('light-magenta', 'light-magenta', 0),
      ],
      [],
      { thresholds: { yellow: 25 } },
    );
    expect(rows.map((row) => row.standing)).toEqual(['low', 'ok', 'low', 'low', 'unknown', 'out']);
    expect(rows[0]?.threshold).toBe(15);
    expect(rows[3]?.threshold).toBe(25);
    expect(rows[1]?.threshold).toBe(15);
  });

  it('shows Black at 4 percent with 7 days left as low although the printer said nothing', () => {
    const rows = supplyStandings([supply('black', 'black', 4, { daysLeft: 7 })], [], THRESHOLDS);
    expect(rows[0]?.standing).toBe('low');
  });

  it('puts a printer reason on the lowest supply when it names none', () => {
    const rows = supplyStandings(
      [
        supply('cyan', 'cyan', 50),
        supply('magenta', 'magenta', 30),
        supply('yellow', 'yellow', null),
      ],
      ['toner-low-warning'],
      THRESHOLDS,
    );
    expect(rows.map((row) => row.standing)).toEqual(['ok', 'low', 'unknown']);
  });

  it('does not double up when a supply is already low or out', () => {
    const low = supplyStandings(
      [supply('a', 'cyan', 10), supply('b', 'magenta', 50)],
      ['marker-supply-low'],
      THRESHOLDS,
    );
    expect(low.map((row) => row.standing)).toEqual(['low', 'ok']);
    const out = supplyStandings(
      [supply('a', 'cyan', 0), supply('b', 'magenta', 5)],
      ['marker-supply-empty'],
      THRESHOLDS,
    );
    expect(out.map((row) => row.standing)).toEqual(['out', 'low']);
  });

  it('marks the lowest supply out when the printer says empty', () => {
    const rows = supplyStandings(
      [supply('a', 'cyan', 5), supply('b', 'magenta', 40)],
      ['marker-ink-empty'],
      THRESHOLDS,
    );
    expect(rows.map((row) => row.standing)).toEqual(['out', 'ok']);
  });

  it('ignores supply reasons when no consumable has a level', () => {
    const rows = supplyStandings([supply('a', 'cyan', null)], ['marker-supply-low'], THRESHOLDS);
    expect(rows[0]?.standing).toBe('unknown');
  });

  it('treats a waste tank the other way round', () => {
    const waste = { consumed: false, kind: 'waste' as const };
    const rows = supplyStandings(
      [
        supply('waste', 'waste', 70, waste),
        supply('w2', 'waste', 90, waste),
        supply('w3', 'waste', 100, waste),
      ],
      [],
      THRESHOLDS,
    );
    expect(rows.map((row) => row.standing)).toEqual(['ok', 'low', 'out']);
    const almost = supplyStandings(
      [supply('waste', 'waste', 10, waste)],
      ['marker-waste-almost-full-warning'],
      THRESHOLDS,
    );
    expect(almost[0]?.standing).toBe('low');
    const full = supplyStandings(
      [supply('waste', 'waste', 10, waste)],
      ['marker-waste-ink-receptacle-full'],
      THRESHOLDS,
    );
    expect(full[0]?.standing).toBe('out');
    const none = supplyStandings([supply('a', 'cyan', 90)], ['marker-waste-full'], THRESHOLDS);
    expect(none[0]?.standing).toBe('ok');
  });

  it('finds the lowest consumable', () => {
    const rows = supplyStandings(
      [supply('a', 'cyan', 80), supply('b', 'magenta', 30), supply('c', 'yellow', null)],
      [],
      THRESHOLDS,
    );
    expect(lowestSupply(rows)?.key).toBe('b');
    expect(lowestSupply([])).toBeNull();
    expect(
      lowestSupply(
        supplyStandings([supply('w', 'waste', 50, { consumed: false })], [], THRESHOLDS),
      ),
    ).toBeNull();
  });
});

describe('the one-line summary agrees with the chips', () => {
  const standings = supplyStandings(
    [
      supply('black', 'black', 4),
      supply('magenta', 'magenta', 9),
      supply('cyan', 'cyan', 80),
      supply('y', 'yellow', 0),
    ],
    [],
    THRESHOLDS,
  );

  it('groups attention into out, low and non-supply problems', () => {
    const attention = attentionOf(standings, problemsOf(['media-jam', 'marker-supply-low'], true));
    expect(attention.out.map((row) => row.key)).toEqual(['y']);
    expect(attention.low.map((row) => row.key)).toEqual(['black', 'magenta']);
    expect(attention.problems.map((problem) => problem.title)).toEqual(['Paper jam']);
  });

  it('puts errors first, then supplies, then state', () => {
    const base = { power: 'awake' as const, paused: false };
    const none = attentionOf([], []);
    expect(printerSummary({ ...base, state: 'idle', attention: none })).toEqual({
      tone: 'ok',
      text: 'Ready',
    });
    expect(printerSummary({ ...base, state: 'printing', attention: none })).toEqual({
      tone: 'busy',
      text: 'Printing',
    });
    expect(printerSummary({ ...base, state: 'stopped', attention: none })).toEqual({
      tone: 'error',
      text: 'Stopped',
    });
    const jam = attentionOf([], problemsOf(['media-jam'], true));
    expect(printerSummary({ ...base, state: 'stopped', attention: jam }).text).toBe('Paper jam');
    expect(
      printerSummary({ ...base, state: 'idle', attention: attentionOf(standings, []) }),
    ).toEqual({ tone: 'error', text: 'Yellow is empty' });
    const lowOnly = attentionOf(
      standings.filter((row) => row.standing === 'low'),
      [],
    );
    expect(printerSummary({ ...base, state: 'idle', attention: lowOnly })).toEqual({
      tone: 'warn',
      text: '2 supplies are low',
    });
    const oneLow = attentionOf(
      standings.filter((row) => row.key === 'black'),
      [],
    );
    expect(printerSummary({ ...base, state: 'idle', attention: oneLow }).text).toBe('Black is low');
    expect(printerSummary({ ...base, state: 'printing', attention: lowOnly }).text).toBe(
      'Printing',
    );
    const outTwo = attentionOf(
      supplyStandings([supply('a', 'cyan', 0), supply('b', 'magenta', 0)], [], THRESHOLDS),
      [],
    );
    expect(printerSummary({ ...base, state: 'idle', attention: outTwo }).text).toBe(
      '2 supplies are empty',
    );
  });

  it('reports sleeping, paused and warning problems', () => {
    const none = attentionOf([], []);
    expect(
      printerSummary({ state: 'idle', power: 'standby', paused: false, attention: none }),
    ).toEqual({ tone: 'asleep', text: 'Asleep' });
    expect(
      printerSummary({ state: 'idle', power: 'awake', paused: true, attention: none }),
    ).toEqual({ tone: 'paused', text: 'Paused' });
    const warning = attentionOf([], problemsOf(['media-low-warning'], false));
    expect(
      printerSummary({ state: 'idle', power: 'awake', paused: false, attention: warning }),
    ).toEqual({ tone: 'warn', text: 'Paper running low' });
    const error = attentionOf([], problemsOf(['cover-open-error'], false));
    expect(
      printerSummary({ state: 'idle', power: 'awake', paused: false, attention: error }),
    ).toEqual({ tone: 'error', text: 'Cover open' });
  });
});
