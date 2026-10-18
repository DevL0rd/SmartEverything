import { describe, expect, it } from 'vitest';
import { laundryProgramByRaw, type JsonValue } from '@smarteverything/domain';
import { draftOf, programOf, reportedOf, stepsOf } from './draft';
import { washerLaundry } from './washer-fixture';

const IDLE = {
  power: true,
  laundry_status: 'Idle',
  laundry_program: 'ECO4060',
  wash_temperature: '40',
  spin_speed: '1400',
  rinse_count: 2,
  soak_minutes: 0,
  steam_hygiene: false,
  extra_water: false,
  quiet_mode: false,
  anti_crease_minutes: 0,
  dry_mode: 'None',
  delay_mode: 'None',
  delay_minutes: 0,
  fault: 'No Faults',
  remote_control: true,
} as const;

const COTTON = laundryProgramByRaw('Cotton');
const ECO = laundryProgramByRaw('ECO4060');

function plan(
  changes: Parameters<typeof draftOf>[0]['changes'],
  finishAt: number | null = null,
): (string | JsonValue)[][] {
  const laundry = washerLaundry(IDLE);
  if (COTTON === undefined) {
    throw new Error('Cotton is missing');
  }
  const draft = draftOf({ program: COTTON, changes, finishAt, nowMinute: 1000 });
  return stepsOf(laundry, draft).map((step) => [step.label, step.value]);
}

describe('laundry draft and start plan', () => {
  it('reads the reported program and options', () => {
    const laundry = washerLaundry(IDLE);
    expect(programOf(laundry.snapshot.values)?.label).toBe('Eco 40-60');
    expect(reportedOf(laundry.snapshot.values)).toMatchObject({
      temperature: 40,
      spin: 1400,
      rinses: 2,
      steam: false,
    });
  });

  it('sends only the program and Start when nothing else changed', () => {
    expect(plan({})).toEqual([
      ['Program', 'Cotton'],
      ['Start', null],
    ]);
  });

  it('sends every chosen option after a program change, in order, before Start', () => {
    expect(plan({ temperature: 60, spin: 1400, rinses: 3, steam: true })).toEqual([
      ['Program', 'Cotton'],
      ['Temperature', '60'],
      ['Spin speed', '1400'],
      ['Rinses', 3],
      ['Steam hygiene', true],
      ['Start', null],
    ]);
  });

  it('puts the finish-by wait before Start so it schedules instead of starting now', () => {
    expect(plan({}, 1300)).toEqual([
      ['Program', 'Cotton'],
      ['When', 'Finish Wash'],
      ['Delay', 300],
      ['Start', null],
    ]);
  });

  it('powers the machine on first when it is off', () => {
    const laundry = washerLaundry({ ...IDLE, power: false, laundry_status: 'Off' });
    if (ECO === undefined) {
      throw new Error('Eco is missing');
    }
    const steps = stepsOf(
      laundry,
      draftOf({ program: ECO, changes: {}, finishAt: null, nowMinute: 0 }),
    );
    expect(steps.map((step) => step.label)).toEqual(['Power', 'Start']);
  });

  it('clears a delay left on the machine when starting now', () => {
    const laundry = washerLaundry({ ...IDLE, delay_mode: 'Finish Wash' });
    if (ECO === undefined) {
      throw new Error('Eco is missing');
    }
    const steps = stepsOf(
      laundry,
      draftOf({ program: ECO, changes: {}, finishAt: null, nowMinute: 0 }),
    );
    expect(steps.map((step) => [step.label, step.value])).toEqual([
      ['When', 'None'],
      ['Start', null],
    ]);
  });
});
