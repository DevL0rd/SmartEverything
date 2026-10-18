import type { AudioApp, AudioDevice } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  appOutputId,
  appOutputName,
  deviceNote,
  masterOf,
  outputOptions,
  sliderMax,
} from './audio-model';

function device(patch: Partial<AudioDevice>): AudioDevice {
  return {
    id: 'sp',
    name: 'Speakers',
    kind: 'speakers',
    isDefault: false,
    available: true,
    volume: 40,
    muted: false,
    maxVolume: 150,
    batteryPercent: null,
    usedBy: [],
    ...patch,
  };
}

const OUTPUTS = [
  device({ id: 'sp', name: 'Speakers', isDefault: true }),
  device({ id: 'hp', name: 'Headphones', kind: 'headphones' }),
  device({ id: 'tv', name: 'LG TV', kind: 'hdmi', available: false }),
];

function app(patch: Partial<AudioApp>): AudioApp {
  return {
    streamId: '7',
    app: 'Spotify',
    icon: null,
    volume: 70,
    muted: false,
    outputId: null,
    ...patch,
  };
}

describe('audio model', () => {
  it('caps the slider at 100 unless over 100 is allowed', () => {
    expect(sliderMax({ maxVolume: 150 }, false)).toBe(100);
    expect(sliderMax({ maxVolume: 150 }, true)).toBe(150);
    expect(sliderMax({ maxVolume: 100 }, true)).toBe(100);
  });

  it('notes an unplugged device, who uses it, or its kind', () => {
    expect(deviceNote(OUTPUTS[2] ?? device({}))).toEqual({ text: 'Unplugged', tone: 'variant' });
    expect(deviceNote(device({ usedBy: ['Discord', 'Zoom'] }))).toEqual({
      text: 'In use by Discord, Zoom',
      tone: 'info',
    });
    expect(deviceNote(device({ kind: 'headphones' })).text).toBe('Headphones');
  });

  it('finds the default output and offers only plugged-in outputs', () => {
    expect(masterOf(OUTPUTS)?.id).toBe('sp');
    expect(masterOf([])).toBeNull();
    expect(outputOptions(OUTPUTS).map((option) => option.value)).toEqual(['sp', 'hp']);
  });

  it('shows an app on the default output until it is moved', () => {
    expect(appOutputId(app({}), OUTPUTS)).toBe('sp');
    expect(appOutputName(app({}), OUTPUTS)).toBe('Speakers');
    expect(appOutputId(app({ outputId: 'hp' }), OUTPUTS)).toBe('hp');
    expect(appOutputName(app({ outputId: 'hp' }), OUTPUTS)).toBe('Headphones');
    expect(appOutputName(app({}), [])).toBe('Default output');
  });
});
