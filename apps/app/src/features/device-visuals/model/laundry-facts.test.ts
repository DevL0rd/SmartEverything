import { laundryProgramById, type LaundryValues } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { LAUNDRY_UNKNOWN, laundryFacts } from './laundry-facts';

function facts(values: LaundryValues): ReturnType<typeof laundryFacts> {
  return laundryFacts({ door_state: 'Closed And Can Not Be Opened', ...values });
}

const BUSY = { laundry_status: 'Busy' } as const;

describe('laundry facts', () => {
  it('has no facts before the machine reports a status', () => {
    expect(laundryFacts({})).toBeNull();
  });

  it('rests while off, ready and delayed', () => {
    expect(facts({ laundry_status: 'Off' })).toMatchObject({
      phase: 'off',
      motion: 'none',
      glow: 'rest',
      display: 'blank',
      running: false,
    });
    expect(facts({ laundry_status: 'Idle' })).toMatchObject({
      phase: 'idle',
      glow: 'rest',
      display: 'program',
    });
    expect(facts({ laundry_status: 'Delay' })).toMatchObject({
      phase: 'delayed',
      glow: 'delay',
      display: 'clock',
      running: false,
    });
  });

  it('tumbles in suds while washing', () => {
    expect(
      facts({ ...BUSY, laundry_phase: 'Washing', remaining_minutes: 72, spin_speed: '1400' }),
    ).toMatchObject({
      stage: 'water',
      motion: 'tumble',
      glow: 'wash',
      water: 0.35,
      suds: true,
      drops: false,
      running: true,
      remaining: 72,
      spin: 1400,
    });
  });

  it('soaks without turning the drum', () => {
    expect(facts({ ...BUSY, laundry_phase: 'Soaking' })).toMatchObject({
      motion: 'none',
      water: 0.45,
      suds: true,
      running: true,
    });
  });

  it('rinses with clear drops in rinse water', () => {
    expect(facts({ ...BUSY, laundry_phase: 'Rinsing' })).toMatchObject({
      glow: 'rinse',
      water: 0.4,
      rinse: true,
      drops: true,
      suds: false,
    });
  });

  it('weighs, spins and drains', () => {
    expect(facts({ ...BUSY, laundry_phase: 'Weighing' })).toMatchObject({ motion: 'weigh' });
    expect(facts({ ...BUSY, laundry_phase: 'Spinning', spin_speed: '800' })).toMatchObject({
      stage: 'spin',
      motion: 'spin',
      glow: 'spin',
      blur: true,
      drain: true,
      water: 0,
      spin: 800,
    });
  });

  it('warms while drying, cools after and steams for hygiene', () => {
    expect(facts({ ...BUSY, laundry_phase: 'Drying' })).toMatchObject({
      stage: 'heat',
      motion: 'slow',
      glow: 'dry',
      heat: true,
      tint: 'warm',
    });
    expect(facts({ ...BUSY, laundry_phase: 'Cooling After Drying' })).toMatchObject({
      heat: false,
      tint: 'cool',
    });
    expect(facts({ ...BUSY, laundry_phase: 'Steam Sterilization' })).toMatchObject({
      motion: 'steam',
      puffs: true,
      tint: 'mist',
    });
  });

  it('freezes the look of the running step while paused', () => {
    expect(
      facts({ laundry_status: 'Paused', laundry_phase: 'Rinsing', remaining_minutes: 30 }),
    ).toMatchObject({
      phase: 'paused',
      paused: true,
      frozen: true,
      running: false,
      glow: 'paused',
      display: 'time',
      water: 0.4,
      drops: true,
      remaining: 30,
    });
    expect(facts({ laundry_status: 'Paused' })).toMatchObject({ water: 0, frozen: true });
  });

  it('shows the finish and the clean drum with a celebration flag', () => {
    expect(facts({ laundry_status: 'Completed' })).toMatchObject({
      glow: 'done',
      display: 'done',
      finished: true,
      cleaned: false,
      running: false,
    });
    expect(facts({ laundry_status: 'Clean Cavity Completed' })).toMatchObject({
      display: 'clean',
      finished: true,
      cleaned: true,
    });
  });

  it('keeps tumbling only briefly to prevent creases', () => {
    expect(facts({ ...BUSY, laundry_phase: 'Blowing And Shaking' })).toMatchObject({
      phase: 'anti_crease',
      motion: 'anti',
      glow: 'done',
      display: 'done',
    });
  });

  it('shows the fault code and stops the motion', () => {
    expect(
      facts({
        ...BUSY,
        laundry_phase: 'Rinsing',
        fault: 'Door Lock Malfunction',
        remaining_minutes: 20,
      }),
    ).toMatchObject({
      stage: 'alert',
      glow: 'fault',
      display: 'error',
      running: false,
      frozen: true,
      water: 0.4,
      faultCode: 1,
    });
    expect(facts({ laundry_status: 'Idle', fault: 'Door Lock Malfunction' })).toMatchObject({
      glow: 'fault',
      motion: 'none',
      frozen: true,
    });
    expect(facts({ laundry_status: 'Idle', fault: 'No Faults' })?.faultCode).toBeNull();
  });

  it('opens the door onto an empty, still drum', () => {
    expect(facts({ laundry_status: 'Idle', door_state: 'Open', drum_light: true })).toMatchObject({
      door: 'open',
      motion: 'none',
      glow: 'rest',
      water: 0,
      drumLight: true,
      running: false,
    });
  });

  it('reads the door, the panel and the supplies', () => {
    expect(facts({ laundry_status: 'Idle', door_state: 'Closed And Can Be Opened' })?.door).toBe(
      'closed',
    );
    expect(
      facts({ laundry_status: 'Idle', door_state: 'Unopenable And High Water Temperature' })?.door,
    ).toBe('hot');
    expect(
      facts({
        laundry_status: 'Idle',
        child_lock: true,
        remote_control: false,
        softener_level: 'Low',
        detergent_level: 'Normal',
      }),
    ).toMatchObject({ childLock: true, remoteOff: true, lowSupply: true });
  });

  it('places the dial tick on the current program', () => {
    expect(facts({ laundry_status: 'Idle' })?.dial).toBeNull();
    expect(
      facts({ laundry_status: 'Idle', laundry_program: 'Cotton', laundry_dial: 'nothing' })?.dial,
    ).toBeNull();
    const ids = [24, 3, 11];
    const bytes = [ids.length, ...ids];
    const hex = [...bytes, bytes.reduce((sum, byte) => sum + byte, 0) % 256]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const dial = (id: number): number | null | undefined =>
      facts({
        laundry_status: 'Idle',
        laundry_program: laundryProgramById(id)?.raw ?? '',
        laundry_dial: hex,
      })?.dial;
    expect(dial(24)).toBe(0);
    expect(dial(3)).toBe(0.5);
    expect(dial(11)).toBe(1);
    expect(dial(62)).toBeNull();
  });

  it('keeps a stable rest frame for unknown values', () => {
    expect(LAUNDRY_UNKNOWN).toMatchObject({ phase: 'idle', motion: 'none', running: false });
  });
});
