import { describe, expect, it } from 'vitest';
import type { JsonValue, LaundryValueRole } from '@smarteverything/domain';
import { clock, MINUTE_MS } from '../../../format/time';
import type { LaundryState } from './state';
import { AT, washerLaundry } from './washer-fixture';

type Roles = Partial<Record<LaundryValueRole, JsonValue>>;

const BASE: Roles = {
  power: true,
  laundry_program: 'ECO4060',
  fault: 'No Faults',
  door_state: 'Closed And Can Not Be Opened',
  remaining_minutes: 72,
  spin_speed: '1400',
  remote_control: true,
};

const BUSY: Roles = { ...BASE, laundry_status: 'Busy' };

function stateOf(roles: Roles, online = true): LaundryState {
  return washerLaundry({ ...BASE, ...roles }, online).state;
}

function after(minutes: number): string {
  return clock(Date.parse(AT) + minutes * MINUTE_MS);
}

describe('laundry state line', () => {
  it('says Off with no actions, and Start is allowed', () => {
    const state = stateOf({ laundry_status: 'Off', power: false });
    expect(state.line).toBe('Off');
    expect(state.short).toBe('Off');
    expect(state.startable).toBe(true);
  });

  it('says Ready with the program, and flags remote control and supplies', () => {
    expect(stateOf({ laundry_status: 'Idle' }).line).toBe('Ready · Eco 40-60');
    expect(stateOf({ laundry_status: 'Idle', child_lock: true }).line).toBe(
      'Ready · Eco 40-60 · Child lock',
    );
    expect(stateOf({ laundry_status: 'Idle', detergent_level: 'Low' }).short).toBe(
      'Ready · Detergent low',
    );
    expect(stateOf({ laundry_status: 'Idle', remote_control: false }).line).toBe('Remote off');
  });

  it.each([
    ['Weighing', 'Weighing · 1 h 12 min'],
    ['Washing', 'Washing · 1 h 12 min'],
    ['Soaking', 'Soaking · 1 h 12 min'],
    ['Rinsing', 'Rinsing · 1 h 12 min'],
    ['Drying', 'Drying · 1 h 12 min'],
    ['Cooling After Drying', 'Cooling · 1 h 12 min'],
    ['Steam Sterilization', 'Steam hygiene · 1 h 12 min'],
  ])('shows the %s step with the time left', (step, line) => {
    const state = stateOf({ ...BUSY, laundry_phase: step });
    expect(state.line).toBe(line);
    expect(state.running).toBe(true);
    expect(state.doneAt).toBe(after(72));
  });

  it('names the spin speed, and keeps the short line to the time', () => {
    const state = stateOf({ ...BUSY, laundry_phase: 'Spinning' });
    expect(state.line).toBe('Spinning · 1400 rpm · 1 h 12 min');
    expect(state.short).toBe('Spinning · 1 h 12 min');
  });

  it('shows a paused cycle with the time left and no running flag', () => {
    const state = stateOf({ laundry_status: 'Paused', laundry_phase: 'Rinsing' });
    expect(state.line).toBe('Paused · 1 h 12 min left');
    expect(state.running).toBe(false);
    expect(state.underlying).toBe('rinse');
    expect(state.tone).toBe('warning');
  });

  it('shows tumbling after the finish as done, not as a running cycle', () => {
    const state = stateOf({ ...BUSY, laundry_phase: 'Blowing And Shaking', remaining_minutes: 0 });
    expect(state.line).toBe('Done · tumbling to prevent creases');
    expect(state.short).toBe('Done · anti-crease');
    expect(state.running).toBe(false);
  });

  it('shows a delayed start from the finish-by wait', () => {
    const state = stateOf({
      laundry_status: 'Delay',
      remaining_minutes: 213,
      delay_mode: 'Finish Wash',
      delay_minutes: 600,
    });
    expect(state.startsAt).toBe(after(600 - 213));
    expect(state.doneAt).toBe(after(600));
    expect(state.short).toBe(`Starts ${after(387)}`);
    expect(state.line).toBe(`Starts ${after(387)} · done ${after(600)}`);
  });

  it('adds the program length to a start-at wait', () => {
    const state = stateOf({
      laundry_status: 'Delay',
      remaining_minutes: 100,
      delay_mode: 'Start Wash',
      delay_minutes: 60,
    });
    expect(state.startsAt).toBe(after(60));
    expect(state.doneAt).toBe(after(160));
  });

  it('shows when the cycle finished, and the drum clean', () => {
    expect(stateOf({ laundry_status: 'Completed', remaining_minutes: 0 }).line).toBe(
      `Done ${after(0)}`,
    );
    expect(stateOf({ laundry_status: 'Clean Cavity Completed' }).line).toBe('Drum clean done');
  });

  it('prefers the open door over the cycle, and a fault over both', () => {
    const open = stateOf({ laundry_status: 'Idle', door_state: 'Open' });
    expect(open.line).toBe('Door open');
    expect(open.door).toBe('Door open');
    const fault = stateOf({
      ...BUSY,
      laundry_phase: 'Rinsing',
      door_state: 'Open',
      fault: 'Water Draining Malfunction',
    });
    expect(fault.key).toBe('fault');
    expect(fault.line).toBe('Fault · Draining problem');
    expect(fault.short).toBe('Draining problem');
    expect(fault.running).toBe(false);
  });

  it('says what it was doing when offline', () => {
    const state = stateOf({ ...BUSY, laundry_phase: 'Rinsing' }, false);
    expect(state.line).toBe('Offline · was Rinsing');
    expect(state.short).toBe('Offline · Rinsing');
    expect(state.tone).toBe('variant');
    expect(state.startable).toBe(false);
  });

  it('does not add supply suffixes in the middle of a cycle', () => {
    expect(
      stateOf({ ...BUSY, laundry_phase: 'Washing', detergent_level: 'Low', child_lock: true }).line,
    ).toBe('Washing · 1 h 12 min');
  });

  it('falls back to Ready for a status the app does not know', () => {
    expect(stateOf({ laundry_status: 'Mystery' }).line).toBe('Ready · Eco 40-60');
  });

  it('labels Start again after a finish', () => {
    expect(stateOf({ laundry_status: 'Completed' }).startLabel).toBe('Start again');
    expect(stateOf({ laundry_status: 'Idle' }).startLabel).toBe('Start');
  });

  it('blocks Start with the reason the machine gives', () => {
    expect(stateOf({ laundry_status: 'Idle', remote_control: false }).readiness).toBe(
      'Turn on remote control on the machine.',
    );
    expect(stateOf({ laundry_status: 'Idle', door_state: 'Open' }).readiness).toBe(
      'Close the door.',
    );
    expect(stateOf({ laundry_status: 'Idle' }).readiness).toBeNull();
  });
});
