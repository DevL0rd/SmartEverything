import { describe, expect, it } from 'vitest';
import type { JsonValue, LaundryValueRole } from '@smarteverything/domain';
import { washerLaundry } from './washer-fixture';

type Roles = Partial<Record<LaundryValueRole, JsonValue>>;

const BASE: Roles = {
  power: true,
  fault: 'No Faults',
  door_state: 'Closed And Can Not Be Opened',
  remaining_minutes: 30,
};

function idsOf(roles: Roles, online = true): string[] {
  return washerLaundry({ ...BASE, ...roles }, online).actions.map((entry) => entry.id);
}

describe('laundry state to actions table', () => {
  it('offers no action when offline, not even Stop', () => {
    expect(idsOf({ laundry_status: 'Busy', laundry_phase: 'Rinsing' }, false)).toEqual([]);
    expect(idsOf({ laundry_status: 'Paused', laundry_phase: 'Rinsing' }, false)).toEqual([]);
    expect(idsOf({ laundry_status: 'Delay' }, false)).toEqual([]);
  });

  it.each(['Weighing', 'Washing', 'Rinsing', 'Spinning', 'Drying'])(
    'offers Pause and Stop while %s',
    (step) => {
      expect(idsOf({ laundry_status: 'Busy', laundry_phase: step })).toEqual(['pause', 'stop']);
    },
  );

  it('offers Resume, Stop and Add a garment when paused behind a releasable lock', () => {
    expect(idsOf({ laundry_status: 'Paused', laundry_phase: 'Rinsing' })).toEqual([
      'resume',
      'stop',
      'garment',
    ]);
  });

  it('disables Add a garment with a reason while the water is hot', () => {
    const laundry = washerLaundry({
      ...BASE,
      laundry_status: 'Paused',
      laundry_phase: 'Washing',
      door_state: 'Unopenable And High Water Temperature',
    });
    const garment = laundry.actions.find((entry) => entry.id === 'garment');
    expect(garment?.disabled).toBe(true);
    expect(garment?.reason).toBe('Off while the door is locked for safety.');
  });

  it('hides Add a garment when the door can already be opened', () => {
    expect(
      idsOf({
        laundry_status: 'Paused',
        laundry_phase: 'Washing',
        door_state: 'Closed And Can Be Opened',
      }),
    ).toEqual(['resume', 'stop']);
  });

  it('offers Stop tumbling and Unlock door while tumbling after the finish', () => {
    expect(idsOf({ laundry_status: 'Busy', laundry_phase: 'Waiting Blow And Shake' })).toEqual([
      'stopTumbling',
      'unlock',
    ]);
  });

  it('offers Start now and Cancel delay while delayed', () => {
    expect(idsOf({ laundry_status: 'Delay' })).toEqual(['startNow', 'cancelDelay']);
  });

  it('offers guidance on a fault, and Stop only when a cycle was running', () => {
    expect(
      idsOf({
        laundry_status: 'Busy',
        laundry_phase: 'Rinsing',
        fault: 'Water Draining Malfunction',
      }),
    ).toEqual(['advice', 'stop']);
    expect(idsOf({ laundry_status: 'Idle', fault: 'Water Draining Malfunction' })).toEqual([
      'advice',
    ]);
  });

  it('offers no stage action when resting: the page Start is the only Start', () => {
    for (const status of ['Off', 'Idle', 'Completed', 'Clean Cavity Completed']) {
      expect(idsOf({ laundry_status: status })).toEqual([]);
    }
    expect(idsOf({ laundry_status: 'Idle', door_state: 'Open' })).toEqual([]);
  });

  it('drops actions the machine has no capability for', () => {
    const laundry = washerLaundry({
      ...BASE,
      laundry_status: 'Busy',
      laundry_phase: 'Washing',
    });
    expect(laundry.roles.has('cycle_pause')).toBe(true);
    expect(laundry.actions.every((entry) => entry.id !== 'advice')).toBe(true);
  });

  it('never offers more than one Start-like action per state', () => {
    for (const status of ['Delay', 'Paused']) {
      const starts = idsOf({ laundry_status: status, laundry_phase: 'Washing' }).filter(
        (id) => id === 'resume' || id === 'startNow',
      );
      expect(starts.length).toBeLessThanOrEqual(1);
    }
  });
});
