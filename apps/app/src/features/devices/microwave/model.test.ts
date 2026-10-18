import { describe, expect, it } from 'vitest';
import { MICROWAVE_KEYS, type JsonValue, type MicrowaveMode } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { microwaveStateLine, programPowerOptions, type MicrowaveConfiguration } from './model';

const AT = '2026-10-17T10:00:00.000Z';
const GRILL: MicrowaveMode = {
  mode: 'Grill',
  supportedOperations: ['start', 'set'],
  supportedOptions: { powerLevel: { default: '300W', supportedValues: ['300W', '600W'] } },
};

function configured(applied: string, supportedPower: readonly string[]): MicrowaveConfiguration {
  return { modes: [GRILL], applied, problem: null, supportedPower: [...supportedPower], unit: 'C' };
}
function valuesOf(entries: Readonly<Record<string, JsonValue>>): DeviceValues {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, { value, observedAt: AT }]),
  );
}

describe('microwave power options', () => {
  it('filters the applied mode by the levels the microwave reports', () => {
    expect(programPowerOptions(GRILL, configured('Grill', ['300W']))).toEqual(['300W']);
  });

  it('offers every level of a mode that is not applied yet', () => {
    expect(programPowerOptions(GRILL, configured('MicroWave', ['100W']))).toEqual(['300W', '600W']);
  });
});

describe('microwave state line', () => {
  const RUNNING = {
    [MICROWAVE_KEYS.state]: 'running',
    [MICROWAVE_KEYS.duration]: '00:06:00',
    [MICROWAVE_KEYS.progress]: 30,
  };

  it('counts the time left from the programmed time and the progress, as the card and page do', () => {
    expect(microwaveStateLine(valuesOf(RUNNING))).toBe('Cooking · 4:12 left');
  });

  it('keeps the time left while paused', () => {
    expect(microwaveStateLine(valuesOf({ ...RUNNING, [MICROWAVE_KEYS.state]: 'paused' }))).toBe(
      'Paused · 4:12 left',
    );
  });

  it('says only the state when nothing is cooking', () => {
    expect(microwaveStateLine(valuesOf({ [MICROWAVE_KEYS.state]: 'ready' }))).toBe('Ready');
    expect(microwaveStateLine(valuesOf({ [MICROWAVE_KEYS.job]: 'finished' }))).toBe('Finished');
  });
});
