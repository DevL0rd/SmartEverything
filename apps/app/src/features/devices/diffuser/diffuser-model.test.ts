import type { AutomationRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  diffuserStatus,
  isScenting,
  lowBattery,
  refillLine,
  scheduleOf,
  sprayOffsets,
  sprayTicks,
  paused,
  strengthLine,
} from './diffuser-model';
import type { DiffuserRead } from './diffuser-read';
import { DIFFUSER_ID } from './fixture';

const READ: DiffuserRead = {
  power: 'on',
  fault: false,
  rhythm: { intervalMinutes: 15, durationSeconds: 4 },
  strength: 'medium',
  battery: 35,
  charging: false,
  light: true,
};

describe('diffuser status and lines', () => {
  it('scents while on and shows the strength line', () => {
    expect(diffuserStatus(READ)).toEqual({ tone: 'positive', label: 'Scenting' });
    expect(strengthLine(READ)).toBe('Medium · every 15 min · 4 s');
    expect(isScenting(READ)).toBe(true);
  });

  it('puts a fault before everything but being offline', () => {
    const fault = { ...READ, fault: true };
    expect(diffuserStatus(fault).tone).toBe('critical');
    expect(strengthLine(fault)).toBe('Check the bottle and nozzle, then turn it off and on');
    expect(isScenting(fault)).toBe(false);
    expect(diffuserStatus({ ...fault, power: 'offline' }).label).toBe('Offline');
  });

  it('keeps the last known strength while off or offline instead of repeating the badge', () => {
    expect(strengthLine({ ...READ, power: 'off' })).toBe('Medium · every 15 min · 4 s');
    expect(strengthLine({ ...READ, power: 'offline' })).toBe('Medium · every 15 min · 4 s');
    expect(strengthLine({ ...READ, power: 'offline', fault: true })).toBe(
      'Medium · every 15 min · 4 s',
    );
  });

  it('says nothing about strength when it is off and has never reported one', () => {
    expect(strengthLine({ ...READ, power: 'off', rhythm: null, strength: null })).toBeNull();
    expect(strengthLine({ ...READ, power: 'offline', rhythm: null, strength: null })).toBeNull();
  });

  it('is paused unless it is on and healthy', () => {
    expect(paused(READ)).toBe(false);
    expect(paused({ ...READ, power: 'off' })).toBe(true);
    expect(paused({ ...READ, power: 'offline' })).toBe(true);
    expect(paused({ ...READ, fault: true })).toBe(true);
  });

  it('waits for the first reading instead of guessing a strength', () => {
    expect(strengthLine({ ...READ, rhythm: null, strength: null })).toBe(
      'Waiting for the first reading',
    );
  });

  it('warns at 20 % or less and not when the level is unknown', () => {
    expect(lowBattery({ ...READ, battery: 20 })).toBe(true);
    expect(lowBattery({ ...READ, battery: 21 })).toBe(false);
    expect(lowBattery({ ...READ, battery: null })).toBe(false);
  });
});

describe('spray rhythm', () => {
  it('lists the sprays of the next two hours at the interval', () => {
    expect(sprayOffsets(15)).toEqual([0, 15, 30, 45, 60, 75, 90, 105, 120]);
    expect(sprayOffsets(20)).toEqual([0, 20, 40, 60, 80, 100, 120]);
    expect(sprayOffsets(10)).toHaveLength(13);
  });

  it('ticks once per interval inside every on span, including the first spray', () => {
    const start = Date.parse('2026-10-18T06:00:00.000Z');
    const hour = 3_600_000;
    const ticks = sprayTicks(
      [
        { start, end: start + hour, state: 'on' },
        { start: start + 3 * hour, end: start + 3 * hour + 10 * 60_000, state: 'on' },
      ],
      20,
    );
    expect(ticks).toEqual([
      start,
      start + 20 * 60_000,
      start + 40 * 60_000,
      start + 60 * 60_000,
      start + 3 * hour,
    ]);
  });

  it('has no ticks while it never ran', () => {
    expect(sprayTicks([], 15)).toEqual([]);
  });
});

describe('refill line', () => {
  it('counts hours for the first three days, then days', () => {
    expect(refillLine(41)).toBe('Running 41 h since refill');
    expect(refillLine(71)).toBe('Running 71 h since refill');
    expect(refillLine(96)).toBe('Running 4 days since refill');
  });
});

function automation(
  id: string,
  at: string,
  to: boolean,
  patch: { readonly enabled?: boolean; readonly device?: string } = {},
): AutomationRow {
  return {
    id,
    name: id,
    enabled: patch.enabled ?? true,
    revision: 1,
    definition: {
      when: [{ on: 'time', at }],
      steps: [{ do: 'set', target: { device: patch.device ?? DIFFUSER_ID }, control: 'power', to }],
    },
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  };
}

describe('schedule line from automations', () => {
  it('reads on and off times of enabled automations that set this diffuser power', () => {
    const line = scheduleOf(
      [automation('b', '00:00', false), automation('a', '15:00', true)],
      DIFFUSER_ID,
    );
    expect(line).toEqual({ text: 'On 15:00 · off 00:00', automationId: 'a' });
  });

  it('ignores disabled automations and other devices', () => {
    const rows = [
      automation('a', '15:00', true, { enabled: false }),
      automation('b', '16:00', true, { device: '00000000-0000-4000-8000-0000000000aa' }),
    ];
    expect(scheduleOf(rows, DIFFUSER_ID)).toBeNull();
  });

  it('has no line without any scheduled power change', () => {
    expect(scheduleOf([], DIFFUSER_ID)).toBeNull();
  });
});
