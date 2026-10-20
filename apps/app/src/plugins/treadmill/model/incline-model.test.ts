import type { TreadmillStateView } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { stateViewFixture, type FixtureInput } from './fixtures';
import {
  chipLabel,
  climbLine,
  deckAngleLine,
  fanAngle,
  inclineChips,
  inclineGateOf,
  inclineLabel,
  inclineTicks,
  movingLine,
  progressLine,
  steppedIncline,
  walkAbandoned,
  unitWord,
  walkStep,
  type InclineRange,
} from './incline-model';

const RANGE: InclineRange = { min: 0, max: 20, step: 1, remoteMax: null };

function viewOf(
  input: FixtureInput,
  extra: {
    readonly range?: InclineRange | null;
    readonly mayConfigure?: boolean;
  } = {},
): TreadmillStateView {
  const base = stateViewFixture(input);
  return {
    ...base,
    mayConfigure: extra.mayConfigure ?? true,
    limits: { ...base.limits, incline: extra.range === undefined ? RANGE : extra.range },
    inclineScale: 'percent',
  };
}

describe('who gets the incline buttons', () => {
  it('draws nothing for a belt without an incline range', () => {
    expect(inclineGateOf(viewOf({}, { range: null }), 'running')).toEqual({ kind: 'none' });
  });

  it('shows members the gauge and a reason, never buttons', () => {
    const gate = inclineGateOf(viewOf({ bodyVisible: false }), 'running');
    expect(gate.kind).toBe('viewer');
  });

  it('enables the buttons while walking on the phone that holds the link', () => {
    expect(inclineGateOf(viewOf({}), 'running')).toMatchObject({
      kind: 'controls',
      enabled: true,
      hold: false,
      reason: null,
      ceiling: 20,
    });
  });

  it('asks for a hold when the belt is stopped on the holder phone', () => {
    expect(inclineGateOf(viewOf({}), 'stopped')).toMatchObject({
      enabled: true,
      hold: true,
    });
  });

  it('disables a remote caller unless the owner allowed it, and caps the ceiling when allowed', () => {
    const off = inclineGateOf(viewOf({ holderIsYou: false }), 'running');
    expect(off).toMatchObject({ enabled: false });
    const on = inclineGateOf(
      viewOf({ holderIsYou: false }, { range: { ...RANGE, remoteMax: 5 } }),
      'running',
    );
    expect(on).toMatchObject({ enabled: true, ceiling: 5 });
    const idle = inclineGateOf(
      viewOf({ holderIsYou: false }, { range: { ...RANGE, remoteMax: 5 } }),
      'stopped',
    );
    expect(idle).toMatchObject({ enabled: false });
  });

  it('disables everything while the belt is not linked', () => {
    const gate = inclineGateOf(viewOf({ phase: 'lost' }), 'running');
    expect(gate).toMatchObject({ enabled: false });
  });
});

describe('one step at a time', () => {
  const gate = { range: RANGE, ceiling: 20 };

  it('steps by the belt’s own step and stops at the ends', () => {
    expect(steppedIncline(6, 1, gate)).toBe(7);
    expect(steppedIncline(6, -1, gate)).toBe(5);
    expect(steppedIncline(20, 1, gate)).toBeNull();
    expect(steppedIncline(0, -1, gate)).toBeNull();
  });

  it('never raises above the remote cap but may always lower', () => {
    const capped = { range: RANGE, ceiling: 5 };
    expect(steppedIncline(5, 1, capped)).toBeNull();
    expect(steppedIncline(8, -1, capped)).toBe(7);
  });

  it('walks a chip target one step per read-back', () => {
    expect(walkStep(7, 10, 1)).toBe(8);
    expect(walkStep(10, 10, 1)).toBeNull();
    expect(walkStep(3, 0, 1)).toBe(2);
    expect(walkStep(0, 0.5, 1)).toBe(0.5);
  });

  it('offers the chips the scale and the cap allow', () => {
    expect(inclineChips({ range: RANGE, ceiling: 20 })).toEqual([0, 5, 10, 15]);
    expect(inclineChips({ range: RANGE, ceiling: 5 })).toEqual([0, 5]);
    expect(inclineChips({ range: { ...RANGE, max: 10 }, ceiling: 10 })).toEqual([0, 5, 10]);
    expect(chipLabel(0)).toBe('Flat');
    expect(chipLabel(5)).toBe('5');
  });
});

describe('what the panel says', () => {
  it('reports progress toward a chip and the deck moving', () => {
    expect(progressLine(7, 10)).toBe('Rising to 10, now 7');
    expect(progressLine(5, 2)).toBe('Lowering to 2, now 5');
    expect(progressLine(5, 5)).toBeNull();
    expect(movingLine(6, 8)).toBe('Rising to 8');
    expect(movingLine(6, null)).toBeNull();
  });

  it('gives the deck angle once, flat as a word', () => {
    expect(deckAngleLine(0)).toBe('Flat');
    expect(deckAngleLine(null)).toBeNull();
    expect(deckAngleLine(10)).toBe('5.7° deck angle');
  });

  it('names the unit by the scale and makes no claim when it is not confirmed', () => {
    expect(unitWord('percent')).toBe('%');
    expect(unitWord('levels')).toBe('level');
    expect(unitWord('unconfirmed')).toBe('incline');
    expect(inclineLabel(6, 'percent', null)).toBe('Incline 6 percent');
    expect(inclineLabel(6, 'unconfirmed', 8)).toBe('Incline 6 incline, rising to 8');
  });

  it('maps the range onto a 60 degree fan with one tick per step', () => {
    expect(fanAngle(0, RANGE)).toBe(0);
    expect(fanAngle(20, RANGE)).toBe(60);
    expect(fanAngle(10, RANGE)).toBe(30);
    expect(fanAngle(40, RANGE)).toBe(60);
    expect(inclineTicks(RANGE)).toHaveLength(21);
  });

  it('shows the climb so far only when the hub reports it', () => {
    expect(climbLine(41.6)).toBe('Climb 42 m');
    expect(climbLine(null)).toBeNull();
  });
});

describe('walkAbandoned', () => {
  it('is true only when the belt leaves running or paused', () => {
    expect(walkAbandoned('running', 'stopped')).toBe(true);
    expect(walkAbandoned('paused', 'idle')).toBe(true);
    expect(walkAbandoned('running', 'paused')).toBe(false);
    expect(walkAbandoned('idle', 'running')).toBe(false);
    expect(walkAbandoned('idle', 'stopped')).toBe(false);
  });
});
