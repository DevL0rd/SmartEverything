import { MICROWAVE_KEYS, type JsonValue, type MicrowaveMode } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import type { DeviceValues } from '../../../store/state';
import { cookingStatus } from './cooking-status';
import type { MicrowaveConfiguration } from './model';

const AT = '2026-10-18T07:00:00.000Z';
const TIME = { min: '00:00:10', max: '01:00:00', default: '00:01:00', resolution: '00:00:10' };

const AIR_FRYER: MicrowaveMode = {
  mode: 'AirFryer',
  supportedOperations: ['start', 'set'],
  supportedOptions: {
    operationTime: TIME,
    temperature: { C: { min: 100, max: 200, default: 180, resolution: 5 } },
  },
};
const GRILL: MicrowaveMode = {
  mode: 'Grill',
  supportedOperations: ['start', 'set'],
  supportedOptions: { operationTime: TIME },
};

const CONFIG: MicrowaveConfiguration = {
  modes: [AIR_FRYER, GRILL],
  applied: 'Grill',
  problem: null,
  supportedPower: undefined,
  unit: 'C',
};

const SEED = { mode: 'AirFryer', duration: '00:12:00', power: '', temperature: 190 };

function observed(entries: Readonly<Record<string, JsonValue>>): DeviceValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, { value, observedAt: AT }]),
  );
}

const IDLE = observed({
  [MICROWAVE_KEYS.state]: 'ready',
  [MICROWAVE_KEYS.remote]: 'true',
  [MICROWAVE_KEYS.door]: 'closed',
  [MICROWAVE_KEYS.lock]: 'unlocked',
});

function status(
  values: DeviceValues,
  draft: Parameters<typeof cookingStatus>[0]['draft'],
  seed: Parameters<typeof cookingStatus>[0]['seed'],
): ReturnType<typeof cookingStatus> {
  return cookingStatus({
    device: deviceFixture(0),
    values,
    config: CONFIG,
    draft,
    seed,
    busy: false,
  });
}

describe('cooking panel starting point', () => {
  it('starts from the program the card repeats, not from the programme the microwave last reported', () => {
    const idle = status(IDLE, null, SEED);
    expect(idle.mode?.mode).toBe('AirFryer');
    expect(idle.program).toEqual(SEED);
  });

  it('keeps what the person changed over the card program', () => {
    const draft = { ...SEED, duration: '00:01:00' };
    expect(status(IDLE, draft, SEED).program).toEqual(draft);
  });

  it('shows the running program while it cooks', () => {
    const running = observed({
      [MICROWAVE_KEYS.state]: 'running',
      [MICROWAVE_KEYS.duration]: '00:06:00',
    });
    const cooking = status({ ...IDLE, ...running }, null, SEED);
    expect(cooking.mode?.mode).toBe('Grill');
    expect(cooking.program?.duration).toBe('00:06:00');
  });

  it('falls back to what the microwave reports when the card has no program', () => {
    expect(status(IDLE, null, null).mode?.mode).toBe('Grill');
  });
});
