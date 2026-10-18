import { describe, expect, it } from 'vitest';
import type { JsonValue, LaundryValueRole } from '@smarteverything/domain';
import type { Cycle } from './cycles';
import { reportedOf } from './draft';
import { stageTexts, type StageTexts } from './stage-text';
import { AT, washerLaundry } from './washer-fixture';
import { clock, MINUTE_MS } from '../../../format/time';

type Roles = Partial<Record<LaundryValueRole, JsonValue>>;

const BASE: Roles = {
  power: true,
  laundry_program: 'ECO4060',
  wash_temperature: '40',
  spin_speed: '1400',
  fault: 'No Faults',
  door_state: 'Closed And Can Not Be Opened',
  remaining_minutes: 72,
};

const LAST: Cycle = {
  id: 'c1',
  program: 'Eco 40-60',
  startedAt: null,
  finishedAt: AT,
  minutes: 213,
  energy: 0.6,
  water: 48,
  outcome: 'completed',
};

function textsFor(
  roles: Roles,
  estimate: number | null = null,
  online = true,
  extra: { readonly starting?: boolean; readonly now?: number } = {},
): StageTexts {
  const laundry = washerLaundry({ ...BASE, ...roles }, online);
  return stageTexts({
    state: laundry.state,
    shown: reportedOf(laundry.snapshot.values),
    estimate,
    last: LAST,
    ...extra,
  });
}

describe('stage text', () => {
  it('shows the time left, when it is done and the settings while running', () => {
    expect(textsFor({ laundry_status: 'Busy', laundry_phase: 'Rinsing' })).toEqual({
      figure: '1 h 12 min',
      unit: 'left',
      callout: `Done at ${clock(Date.parse(AT) + 72 * MINUTE_MS)}`,
      caption: 'Eco 40-60 · 40° · 1400 rpm',
      spoken: 'Rinsing',
    });
  });

  it('shows Ready with the estimate and settings when idle', () => {
    expect(textsFor({ laundry_status: 'Idle', remaining_minutes: 213 }, 213)).toMatchObject({
      figure: 'Ready',
      unit: null,
      callout: 'Takes about 3 h 33 min',
      caption: 'Eco 40-60 · 40° · 1400 rpm',
    });
  });

  it('shows how long the last cycle took once finished', () => {
    expect(textsFor({ laundry_status: 'Completed', remaining_minutes: 0 })).toMatchObject({
      figure: 'Done',
      caption: 'Took 3 h 33 min · 0.6 kWh · 48 L',
    });
  });

  it('shows Offline instead of a countdown', () => {
    expect(
      textsFor({ laundry_status: 'Busy', laundry_phase: 'Rinsing' }, null, false),
    ).toMatchObject({
      figure: 'Offline',
      unit: null,
      caption: null,
      spoken: 'Offline',
    });
  });

  it('shows no countdown while tumbling after the finish', () => {
    expect(
      textsFor({
        laundry_status: 'Busy',
        laundry_phase: 'Blowing And Shaking',
        remaining_minutes: 0,
      }),
    ).toMatchObject({ figure: 'Done', unit: null, caption: 'Tumbling to prevent creases' });
  });

  it('shows Starting while the start is being sent', () => {
    expect(textsFor({ laundry_status: 'Idle' }, null, true, { starting: true })).toMatchObject({
      figure: 'Starting…',
      unit: null,
      callout: null,
      spoken: 'Starting',
    });
  });

  it('says how long ago the cycle finished', () => {
    const finished = { laundry_status: 'Completed', remaining_minutes: 0 } as const;
    const now = Date.parse(AT) + 125 * MINUTE_MS;
    expect(textsFor(finished, null, true, { now }).callout).toBe('Done 2 h 5 min ago');
    expect(textsFor(finished, null, true, { now: Date.parse(AT) }).callout).toBe('Done just now');
  });
});
