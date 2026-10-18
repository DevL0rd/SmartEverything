import { describe, expect, it } from 'vitest';
import type { JsonValue, LaundryValueRole } from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';
import { stepSpoken, stripOf, upNextOf, type Strip } from './strip';
import { washerLaundry } from './washer-fixture';

type Roles = Partial<Record<LaundryValueRole, JsonValue>>;

const ECO_MASK = 708;

function stripFor(roles: Roles, online = true): Strip | null {
  const laundry = washerLaundry(
    {
      laundry_phases: ECO_MASK,
      fault: 'No Faults',
      door_state: 'Closed And Can Not Be Opened',
      ...roles,
    },
    online,
  );
  return stripOf(laundry.snapshot.values, laundry.state);
}

describe('planned phases strip', () => {
  it('shows the planned steps of the program with the current one marked', () => {
    const strip = stripFor({ laundry_status: 'Busy', laundry_phase: 'Rinsing' });
    expect(strip?.steps.map((step) => step.label)).toEqual(['Weigh', 'Wash', 'Rinse', 'Spin']);
    expect(strip?.current).toBe(2);
  });

  it('keeps the step while paused, in a fault, or offline', () => {
    expect(stripFor({ laundry_status: 'Paused', laundry_phase: 'Washing' })?.current).toBe(1);
    expect(
      stripFor({
        laundry_status: 'Busy',
        laundry_phase: 'Spinning',
        fault: 'Door Lock Malfunction',
      })?.current,
    ).toBe(3);
    expect(stripFor({ laundry_status: 'Busy', laundry_phase: 'Weighing' }, false)?.current).toBe(0);
  });

  it('adds a step the machine runs but did not plan', () => {
    const strip = stripFor({ laundry_status: 'Busy', laundry_phase: 'Soaking' });
    expect(strip?.steps.map((step) => step.label)).toContain('Soak');
  });

  it('adds Anti-crease after the planned steps while tumbling', () => {
    const strip = stripFor({ laundry_status: 'Busy', laundry_phase: 'Blowing And Shaking' });
    expect(strip?.steps.at(-1)?.label).toBe('Anti-crease');
    expect(strip?.current).toBe(strip === null ? -1 : strip.steps.length - 1);
  });

  it('is hidden when the machine is not in a cycle or reports no plan', () => {
    expect(stripFor({ laundry_status: 'Idle' })).toBeNull();
    expect(stripFor({ laundry_status: 'Completed' })).toBeNull();
    expect(
      stripFor({ laundry_status: 'Busy', laundry_phase: 'Washing', laundry_phases: 0 }),
    ).toBeNull();
  });

  it('speaks each step with its place and state', () => {
    const strip = stripFor({ laundry_status: 'Busy', laundry_phase: 'Rinsing' });
    if (strip === null) {
      throw new Error('strip missing');
    }
    expect(stepSpoken(strip, 0)).toBe('Step 1 of 4, Weigh, done');
    expect(stepSpoken(strip, 2)).toBe('Step 3 of 4, Rinse, current');
    expect(stepSpoken(strip, 3)).toBe('Step 4 of 4, Spin');
  });

  it('guesses when the next step starts from the time left', () => {
    const strip = stripFor({ laundry_status: 'Busy', laundry_phase: 'Washing' });
    if (strip === null) {
      throw new Error('strip missing');
    }
    const next = upNextOf(strip, 60, 0);
    expect(next?.label).toBe('Rinse');
    expect(next?.atMs).toBeGreaterThan(0);
    expect(next?.atMs).toBeLessThan(60 * MINUTE_MS);
    expect(upNextOf(strip, null, 0)).toBeNull();
  });

  it('has no next step after the last one', () => {
    const strip = stripFor({ laundry_status: 'Busy', laundry_phase: 'Spinning' });
    if (strip === null) {
      throw new Error('strip missing');
    }
    expect(upNextOf(strip, 10, 0)).toBeNull();
  });
});
