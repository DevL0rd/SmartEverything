import {
  MICROWAVE_KEYS,
  type DeviceLogEntry,
  type JsonValue,
  type MicrowaveMode,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { DeviceValues } from '../../../store/state';
import type { MicrowaveConfiguration } from './model';
import { quickState, type QuickState } from './quick-model';

const AT = '2026-10-18T07:00:00.000Z';

const TIME = { min: '00:00:10', max: '01:00:00', default: '00:01:00', resolution: '00:00:10' };

const MICROWAVE: MicrowaveMode = {
  mode: 'MicroWave',
  supportedOperations: ['set', 'stop'],
  supportedOptions: {
    operationTime: TIME,
    powerLevel: { default: '700W', supportedValues: ['100W', '450W', '700W', '900W'] },
  },
};
const AIR_FRYER: MicrowaveMode = {
  mode: 'AirFryer',
  supportedOperations: ['start', 'set', 'stop'],
  supportedOptions: {
    operationTime: TIME,
    temperature: { C: { min: 100, max: 200, default: 180, resolution: 5 } },
  },
};
const FRESHEN: MicrowaveMode = {
  mode: 'Deodorization',
  supportedOperations: ['start'],
  supportedOptions: {},
};

function config(applied: string): MicrowaveConfiguration {
  return {
    modes: [MICROWAVE, AIR_FRYER, FRESHEN],
    applied,
    problem: null,
    supportedPower: ['100W', '450W', '700W', '900W'],
    unit: 'C',
  };
}

function observed(entries: Readonly<Record<string, JsonValue>>): DeviceValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, { value, observedAt: AT }]),
  );
}

const READY = observed({
  [MICROWAVE_KEYS.remote]: 'true',
  [MICROWAVE_KEYS.door]: 'closed',
  [MICROWAVE_KEYS.lock]: 'unlocked',
});

function cycle(settings: Readonly<Record<string, JsonValue>>): DeviceLogEntry {
  return {
    at: AT,
    kind: 'cycle',
    title: 'Cooking finished',
    settings,
    cause: { kind: 'device' },
  };
}

function ready(state: QuickState): Extract<QuickState, { kind: 'ready' }> {
  if (state.kind !== 'ready') {
    throw new Error(`Expected a ready quick state, received ${state.reason}`);
  }
  return state;
}

describe('microwave quick actions', () => {
  it('repeats the last program the microwave can start from here', () => {
    const state = ready(
      quickState(
        config('MicroWave'),
        READY,
        cycle({ mode: 'AirFryer', temperature: 200, seconds: 720 }),
      ),
    );
    expect(state.primary.label).toBe('Air fry 12 min');
    expect(state.primary.start).toBe(true);
    expect(state.primary.program).toMatchObject({
      mode: 'AirFryer',
      temperature: 200,
      duration: '00:12:00',
    });
    expect(state.note).toBeNull();
  });

  it('only sets a power mode and says the start is pressed on the microwave', () => {
    const state = ready(
      quickState(
        config('AirFryer'),
        READY,
        cycle({ mode: 'MicroWave', power: '700W', seconds: 120 }),
      ),
    );
    expect(state.primary.label).toBe('Set 2 min · 700 W');
    expect(state.primary.start).toBe(false);
    expect(state.note).toBe('Press Start on the microwave.');
  });

  it('offers the quick times the mode allows on its steps', () => {
    const state = ready(quickState(config('AirFryer'), READY, undefined));
    expect(state.chips.map((chip) => chip.label)).toEqual(['30 s', '1 min', '2 min', '5 min']);
    expect(state.chips[3]?.program.duration).toBe('00:05:00');
  });

  it('falls back to the applied mode when nothing was cooked yet', () => {
    const state = ready(quickState(config('AirFryer'), READY, undefined));
    expect(state.primary.program.mode).toBe('AirFryer');
  });

  it('ignores a remembered program the mode no longer accepts', () => {
    const state = ready(
      quickState(
        config('AirFryer'),
        READY,
        cycle({ mode: 'AirFryer', temperature: 99, seconds: 720 }),
      ),
    );
    expect(state.primary.program.temperature).toBe(180);
  });

  it('offers no times for a mode without a duration', () => {
    const state = ready(
      quickState(config('Deodorization'), READY, cycle({ mode: 'Deodorization' })),
    );
    expect(state.chips).toEqual([]);
    expect(state.primary.label).toBe('Freshen');
  });

  it('replaces every action with the reason when remote control is off or the door is open', () => {
    const off = quickState(
      config('AirFryer'),
      observed({ [MICROWAVE_KEYS.remote]: 'false' }),
      undefined,
    );
    expect(off).toEqual({ kind: 'blocked', reason: 'Turn on remote control on the microwave.' });
    const open = quickState(
      config('AirFryer'),
      observed({
        [MICROWAVE_KEYS.remote]: 'true',
        [MICROWAVE_KEYS.door]: 'open',
        [MICROWAVE_KEYS.lock]: 'unlocked',
      }),
      undefined,
    );
    expect(open).toEqual({ kind: 'blocked', reason: 'Close the microwave door.' });
  });

  it('says so when the microwave reported no usable modes', () => {
    const none: MicrowaveConfiguration = {
      ...config('x'),
      modes: [],
      problem: 'Cooking options missing',
    };
    expect(quickState(none, READY, undefined)).toEqual({
      kind: 'blocked',
      reason: 'Cooking options missing',
    });
  });
});
