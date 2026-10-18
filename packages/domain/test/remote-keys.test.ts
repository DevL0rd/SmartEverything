import { describe, expect, it } from 'vitest';
import { buttonLabel, keyFor, modeKeysOf, normalKey, roleOf } from '../src';

describe('normalKey', () => {
  it('spells a key the way the role words do', () => {
    expect(normalKey('  Temp+ ')).toBe('temp_up');
    expect(normalKey('Temp-')).toBe('temp_down');
    expect(normalKey('Fan Speed')).toBe('fan_speed');
    expect(normalKey('dpad-left')).toBe('dpad_left');
  });
});

describe('keyFor and roleOf', () => {
  it('finds a role by any of its common spellings', () => {
    const options = ['Power', 'Temp+', 'Temp-', 'KEY_VOLUMEUP', 'Vol down', 'Fan Speed', 'Swing'];
    expect(keyFor(options, 'power')).toBe('Power');
    expect(keyFor(options, 'temp_up')).toBe('Temp+');
    expect(keyFor(options, 'temp_down')).toBe('Temp-');
    expect(keyFor(options, 'vol_up')).toBe('KEY_VOLUMEUP');
    expect(keyFor(options, 'vol_down')).toBe('Vol down');
    expect(keyFor(options, 'speed_cycle')).toBe('Fan Speed');
    expect(keyFor(options, 'swing')).toBe('Swing');
  });

  it('returns nothing when the remote has no such key', () => {
    expect(keyFor(['Power'], 'mute')).toBeUndefined();
    expect(keyFor([], 'power')).toBeUndefined();
  });

  it('names the role of a key and leaves unknown keys without one', () => {
    expect(roleOf('Brighter')).toBe('bright_up');
    expect(roleOf('dimmer')).toBe('bright_down');
    expect(roleOf('Play pause')).toBe('play_pause');
    expect(roleOf('Netflix')).toBeUndefined();
  });

  it('tells the speed step keys from the single speed cycle key', () => {
    expect(roleOf('Speed up')).toBe('speed_up');
    expect(roleOf('Speed')).toBe('speed_cycle');
  });
});

describe('modeKeysOf', () => {
  it('keeps the keys that choose a mode', () => {
    expect(modeKeysOf(['Power', 'Cool', 'Heat', 'Fan only', 'Auto', 'Dry', 'Mode'])).toEqual([
      'Cool',
      'Heat',
      'Fan only',
      'Auto',
      'Dry',
    ]);
    expect(modeKeysOf([])).toEqual([]);
  });
});

describe('buttonLabel', () => {
  it('makes a key name readable', () => {
    expect(buttonLabel('KEY_VOLUME_UP')).toBe('Volume up');
    expect(buttonLabel('key_power')).toBe('Power');
    expect(buttonLabel('power_off')).toBe('Power off');
    expect(buttonLabel('HDMI')).toBe('Hdmi');
  });

  it('keeps mixed case and falls back to the name when nothing is left', () => {
    expect(buttonLabel('Netflix')).toBe('Netflix');
    expect(buttonLabel('iPlayer')).toBe('IPlayer');
    expect(buttonLabel('key_')).toBe('key_');
    expect(buttonLabel('_')).toBe('_');
  });
});
