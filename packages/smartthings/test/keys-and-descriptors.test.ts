import { isRawCapability } from '@smarteverything/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  descriptorFromSchema,
  descriptorFromValue,
  RAW_NUMBER_BOUND,
  RAW_TEXT_LIMIT,
} from '../src/descriptors';
import {
  componentLabel,
  humanize,
  MAIN_COMPONENT,
  rawAttributeKey,
  rawCapabilityKey,
  rawCommandKey,
  snakeOf,
  standardKeyFor,
} from '../src/keys';

describe('capability keys', () => {
  it('turns SmartThings names into lower snake case', () => {
    expect(snakeOf('samsungce.washerOperatingState')).toBe('samsungce.washer_operating_state');
    expect(snakeOf('switch2Level')).toBe('switch2_level');
    expect(snakeOf("-odd name!'s")).toBe('odd_name_s');
    expect(snakeOf('._x')).toBe('x');
  });

  it('keeps standard keys on the main component and prefixes them elsewhere', () => {
    expect(MAIN_COMPONENT).toBe('main');
    expect(standardKeyFor('main', 'power')).toBe('power');
    expect(standardKeyFor('freezer', 'target_temperature')).toBe('raw:freezer-target_temperature');
    expect(standardKeyFor('sub.unit', 'power')).toBe('raw:sub_unit-power');
  });

  it('separates attributes with a dot and commands with a colon', () => {
    expect(rawAttributeKey('main', 'custom.dustFilter', 'dustFilterUsage')).toBe(
      'raw:custom.dust_filter.dust_filter_usage',
    );
    expect(rawCommandKey('main', 'audioVolume', 'volumeUp')).toBe('raw:audio_volume:volume_up');
    expect(rawAttributeKey('switch1', 'switch', 'switch')).toBe('raw:switch1-switch.switch');
    expect(rawCommandKey('cooler', 'refresh', 'refresh')).toBe('raw:cooler-refresh:refresh');
    expect(rawCapabilityKey('main', 'tvChannel')).toBe('raw:tv_channel');
    expect(rawCapabilityKey('main2', 'tvChannel')).toBe('raw:main2-tv_channel');
  });

  it('always produces keys the domain accepts as raw capabilities', () => {
    const name = fc.stringMatching(/^[a-z][A-Za-z0-9.]{0,20}$/);
    fc.assert(
      fc.property(name, name, name, (component, capability, attribute) => {
        expect(isRawCapability(rawAttributeKey(component, capability, attribute))).toBe(true);
        expect(isRawCapability(rawCommandKey(component, capability, attribute))).toBe(true);
      }),
    );
  });

  it('turns names into readable labels', () => {
    expect(humanize('robotCleanerMovement')).toBe('Robot cleaner movement');
    expect(humanize('samsungce.dryer_mode')).toBe('Samsungce dryer mode');
    expect(humanize(' -x- ')).toBe('X');
    expect(humanize('')).toBe('');
    expect(humanize('a__b')).toBe('A b');
  });

  it('names the component in labels off the main component', () => {
    expect(componentLabel('main', 'Power', 'Main')).toBe('Power');
    expect(componentLabel('freezer', 'Temperature', 'Freezer drawer')).toBe(
      'Freezer drawer: Temperature',
    );
    expect(componentLabel('freezer', 'Temperature', null)).toBe('Freezer: Temperature');
  });
});

describe('describing raw values', () => {
  it('reads enumerations, booleans and numbers from a capability schema', () => {
    expect(descriptorFromSchema({ type: 'string', enum: ['a', 'b'] }, null)).toEqual({
      kind: 'enum',
      options: ['a', 'b'],
    });
    expect(descriptorFromSchema({ type: 'boolean' }, null)).toEqual({ kind: 'boolean' });
    expect(descriptorFromSchema({ type: 'integer', minimum: 0, maximum: 10 }, 'W')).toEqual({
      kind: 'number',
      min: 0,
      max: 10,
      step: 1,
      unit: 'W',
    });
    expect(descriptorFromSchema({ type: 'number' }, null)).toEqual({
      kind: 'number',
      min: -100_000,
      max: 100_000,
      step: 0.1,
    });
    expect(RAW_NUMBER_BOUND).toBe(100_000);
  });

  it('describes strings, objects and empty enumerations as text', () => {
    expect(RAW_TEXT_LIMIT).toBe(4096);
    expect(descriptorFromSchema({ type: 'string', enum: [] }, 'x')).toEqual({
      kind: 'text',
      maxLength: 4096,
    });
    expect(descriptorFromSchema({ type: 'string', maxLength: 20 }, null)).toEqual({
      kind: 'text',
      maxLength: 20,
    });
    expect(descriptorFromSchema({ type: 'object' }, null)).toEqual({
      kind: 'text',
      maxLength: 4096,
    });
  });

  it('infers a description from a reported value when no schema is known', () => {
    expect(descriptorFromValue(true, null)).toEqual({ kind: 'boolean' });
    expect(descriptorFromValue(3, 'W')).toEqual({
      kind: 'number',
      min: -100_000,
      max: 100_000,
      step: 1,
      unit: 'W',
    });
    expect(descriptorFromValue(3.5, null)).toEqual({
      kind: 'number',
      min: -100_000,
      max: 100_000,
      step: 0.1,
    });
    expect(descriptorFromValue('x', 'W')).toEqual({ kind: 'text', maxLength: 4096 });
    expect(descriptorFromValue(null, null)).toEqual({ kind: 'text', maxLength: 4096 });
  });
});
