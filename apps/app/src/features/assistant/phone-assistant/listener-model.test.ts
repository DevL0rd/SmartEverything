import { describe, expect, it } from 'vitest';
import { LISTENING_POWER_MODES } from '@smarteverything/domain';
import {
  BATTERY_ESTIMATE,
  POWER_MODES,
  batteryNote,
  earStatus,
  powerModeInfo,
  type EarFacts,
} from './listener-model';

const BASE: EarFacts = {
  wake: true,
  mode: 'always',
  native: { status: 'listening', detail: null, transcribe: false },
  microphone: 'granted',
  offline: false,
};

describe('the power modes', () => {
  it('describes every mode the hub knows, in the hub order, with the hub labels', () => {
    expect(POWER_MODES.map((info) => info.mode)).toEqual([...LISTENING_POWER_MODES]);
    expect(POWER_MODES.map((info) => info.label)).toEqual([
      'Always',
      'Only when the screen is on',
      'Only while charging',
      'Only away from home',
    ]);
  });

  it('ranks the battery cost from most to none and never claims a number it has not measured', () => {
    expect(POWER_MODES.map((info) => info.drain)).toEqual([3, 1, 0, 2]);
    expect(batteryNote('always')).toBe(BATTERY_ESTIMATE);
    expect(batteryNote('away_from_home')).toContain(BATTERY_ESTIMATE);
    expect(batteryNote('charging')).not.toMatch(/\d/);
    expect(batteryNote('screen_on')).not.toMatch(/\d/);
  });

  it('finds a mode by name', () => {
    expect(powerModeInfo('charging').icon).toBe('plug');
  });
});

describe('what the phone ear is doing', () => {
  it('is off when the switch is off, whatever the native ear says', () => {
    expect(earStatus({ ...BASE, wake: false }).label).toBe('Off');
  });

  it('shows the real native state when the switch is on', () => {
    expect(earStatus(BASE)).toMatchObject({ tone: 'positive', label: 'Listening now' });
    expect(
      earStatus({ ...BASE, native: { status: 'resting', detail: 'in a call', transcribe: false } }),
    ).toMatchObject({ tone: 'info', detail: 'in a call' });
    expect(
      earStatus({
        ...BASE,
        native: { status: 'unavailable', detail: 'denied', transcribe: false },
      }),
    ).toMatchObject({ tone: 'critical', detail: 'denied' });
  });

  it('asks for the microphone before anything else when it is missing', () => {
    expect(earStatus({ ...BASE, microphone: 'denied' }).label).toBe('Needs the microphone');
  });

  it('explains what a waiting ear waits for from its power mode', () => {
    const off = { status: 'off', detail: null, transcribe: false } as const;
    expect(earStatus({ ...BASE, native: off, mode: 'charging' }).detail).toBe(
      'Starts when you plug the phone in.',
    );
    expect(earStatus({ ...BASE, native: off, mode: 'away_from_home' }).detail).toContain(
      'leaves your home network',
    );
    expect(earStatus({ ...BASE, native: off, mode: 'screen_on' }).detail).toContain('screen');
  });

  it('says so when the hub is not reachable', () => {
    expect(earStatus({ ...BASE, offline: true }).label).toBe('Hub not reachable');
  });
});
