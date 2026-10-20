import type { TreadmillLiveFrame } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../../features/device-visuals/types';
import { treadmillFactsOf, treadmillLabel, treadmillVisualState } from './live-visual';

const BASE: VisualState = {
  power: 'off',
  online: true,
  level: 0,
  band: null,
  target: null,
  targetShare: null,
  current: null,
  oscillating: false,
  angle: null,
  colour: null,
  ambientLight: null,
  waterLow: false,
  waterLevel: null,
  thermal: 'idle',
  locked: null,
  position: null,
  progress: null,
  battery: null,
  pulse: null,
  syncing: false,
  load: null,
  reading: null,
  source: null,
  presence: null,
  open: null,
};

function frame(state: TreadmillLiveFrame['belt']['state'], speedKmh: number): TreadmillLiveFrame {
  return {
    at: '2026-10-18T10:00:00.000Z',
    belt: {
      state,
      mode: 'manual',
      speedKmh,
      targetSpeedKmh: null,
      timeS: 70,
      distanceM: 90,
      steps: 150,
      cadence: 100,
      inclinePercent: 6,
      inclineTarget: null,
      inclineGrade: 6,
      inclineScale: 'percent',
      button: null,
      childLock: true,
      controlLost: false,
      link: 'linked',
    },
    session: null,
    body: null,
  };
}

describe('the picture of the belt from a live frame', () => {
  it('turns on for a moving belt and carries zone, time, child lock, cadence and incline', () => {
    const facts = treadmillFactsOf(frame('running', 9), null, null);
    expect(facts).toEqual({
      belt: 'running',
      link: 'linked',
      speedKmh: 9,
      zone: 'run',
      timeS: 70,
      distanceM: 90,
      fault: null,
      childLock: true,
      cadence: 100,
      inclineGrade: 6,
      inclineLabel: '6%',
      inclineMoving: null,
      heartZone: null,
    });
    expect(treadmillVisualState(BASE, facts).power).toBe('on');
  });

  it('stays off when the belt is still, shows the fault code and turns on while the deck moves', () => {
    const fault = treadmillFactsOf(frame('fault', 0), { code: 'E03', cause: 'x', tip: 'y' }, null);
    expect(treadmillVisualState(BASE, fault).power).toBe('off');
    expect(fault.fault).toBe('E03');
    const rising = frame('stopped', 0);
    const moving = treadmillFactsOf(
      { ...rising, belt: { ...rising.belt, inclineTarget: 8 } },
      null,
      null,
    );
    expect(moving.inclineMoving).toBe('up');
    expect(treadmillVisualState(BASE, moving).power).toBe('on');
    const falling = treadmillFactsOf(
      { ...rising, belt: { ...rising.belt, inclineTarget: 2 } },
      null,
      null,
    );
    expect(falling.inclineMoving).toBe('down');
  });

  it('labels levels without a percent sign and takes the heart zone from the body reading', () => {
    const base = frame('running', 7);
    const facts = treadmillFactsOf(
      {
        ...base,
        belt: { ...base.belt, inclineScale: 'levels' },
        body: {
          kcal: 1,
          kcalNet: 1,
          met: null,
          weightKg: 70,
          heartRate: 160,
          kcalSource: null,
          heartRateSource: null,
        },
      },
      null,
      200,
    );
    expect(facts.inclineLabel).toBe('6');
    expect(facts.heartZone).toBe(3);
  });

  it('follows the person maximum heart rate and shows no zone without one', () => {
    const base = frame('running', 7);
    const body = {
      kcal: 1,
      kcalNet: 1,
      met: null,
      weightKg: 70,
      heartRate: 160,
      kcalSource: null,
      heartRateSource: null,
    };
    const live = { ...base, body };
    expect(treadmillFactsOf(live, null, 170).heartZone).toBe(4);
    expect(treadmillFactsOf(live, null, 200).heartZone).toBe(3);
    expect(treadmillFactsOf(live, null, null).heartZone).toBeNull();
  });

  it('gives one label per state', () => {
    expect(treadmillLabel(treadmillFactsOf(frame('running', 7), null, null))).toBe(
      'Treadmill running, 7.0 kilometres per hour, incline 6%, walker jogging',
    );
    expect(treadmillLabel(treadmillFactsOf(frame('safety_stop', 0), null, null))).toBe(
      'Treadmill safety stop, incline 6%',
    );
  });
});
