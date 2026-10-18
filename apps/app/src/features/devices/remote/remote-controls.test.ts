import { describe, expect, it } from 'vitest';
import { controlsFor } from './remote-controls';

describe('controlsFor', () => {
  it('gives an air conditioner power, a temperature stepper and its mode keys', () => {
    const controls = controlsFor('ac', ['Power', 'Temp up', 'Temp down', 'Cool', 'Heat', 'Swing']);
    expect(controls.power).toBe('Power');
    expect(controls.stepper).toEqual({
      id: 'temp',
      label: 'Temperature',
      up: 'Temp up',
      down: 'Temp down',
    });
    expect(controls.modes).toEqual(['Cool', 'Heat']);
    expect(controls.keys.map((key) => key.key)).toEqual(['Swing']);
  });

  it('keeps the single mode key as a button when there are no discrete modes', () => {
    const controls = controlsFor('ac', ['Power', 'Mode']);
    expect(controls.modes).toEqual([]);
    expect(controls.keys.map((key) => key.key)).toEqual(['Mode']);
  });

  it('shows a control only when its key exists and keeps a lone step key as a button', () => {
    const controls = controlsFor('speaker', ['Power', 'Vol up']);
    expect(controls.stepper).toBeNull();
    expect(controls.keys.map((key) => key.key)).toEqual(['Vol up']);
    expect(controls.power).toBe('Power');
    expect(controlsFor('light', ['Power']).keys).toEqual([]);
  });

  it('uses a single speed key for a fan without step keys', () => {
    const controls = controlsFor('fan', ['Power', 'Speed', 'Oscillate']);
    expect(controls.stepper).toBeNull();
    expect(controls.keys.map((key) => key.role)).toEqual(['oscillate', 'speed_cycle']);
  });

  it('takes the first three keys of an unknown remote', () => {
    const controls = controlsFor('other', ['Power', 'A', 'B', 'C', 'D']);
    expect(controls.power).toBe('Power');
    expect(controls.keys.map((key) => key.key)).toEqual(['A', 'B', 'C']);
  });

  it('tells whether the remote has a direction pad', () => {
    expect(controlsFor('settop', ['Power', 'Up', 'Down', 'Left', 'Right', 'OK']).hasPad).toBe(true);
    expect(controlsFor('settop', ['Power']).hasPad).toBe(false);
  });

  it('gives a remote with no keys no controls', () => {
    expect(controlsFor('tv', [])).toEqual({
      power: null,
      stepper: null,
      keys: [],
      modes: [],
      hasPad: false,
    });
  });
});
