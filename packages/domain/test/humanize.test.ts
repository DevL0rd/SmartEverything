import { describe, expect, it } from 'vitest';
import {
  HEALTH_METRICS,
  LOGGABLE_TYPES,
  friendlyUnit,
  humanizeEnum,
  humanizeKey,
  robotMoveLabel,
} from '../src';
import { HEALTH_SIGNALS } from '../src/signal-sources/health';

describe('humanizeKey', () => {
  it('turns snake case, camel case and dotted keys into a capitalised phrase', () => {
    expect(humanizeKey('robotCleanerMovement')).toBe('Robot cleaner movement');
    expect(humanizeKey('samsungce.dryer_mode')).toBe('Samsungce dryer mode');
    expect(humanizeKey('switch_led')).toBe('Switch led');
    expect(humanizeKey('countdown_1')).toBe('Countdown 1');
    expect(humanizeKey('co2Level')).toBe('Co2 level');
    expect(humanizeKey('BodyFat')).toBe('Body fat');
  });

  it('drops leading, trailing and repeated separators', () => {
    expect(humanizeKey(' -x- ')).toBe('X');
    expect(humanizeKey('a__b')).toBe('A b');
    expect(humanizeKey('')).toBe('');
  });

  it('keeps the writing of a key that is nothing but separators and the case of its plain words', () => {
    expect(humanizeKey('__')).toBe('__');
    expect(humanizeKey('Light_Mode')).toBe('Light Mode');
    expect(humanizeKey('hubURL')).toBe('Hub URL');
  });
});

describe('the labels built from keys', () => {
  it('keeps the robot move labels', () => {
    expect(robotMoveLabel('ability_dance')).toBe('Dance');
    expect(robotMoveLabel('interact_high_five')).toBe('High five');
    expect(robotMoveLabel('behavior_look_around')).toBe('Look around');
    expect(robotMoveLabel('wave')).toBe('Wave');
  });

  it('keeps the health signal labels', () => {
    const labels = HEALTH_SIGNALS.kinds.flatMap((kind) =>
      typeof kind.fields === 'string' ? [] : kind.fields.map((field) => field.label),
    );
    expect(labels).toContain('Heart rate average');
    expect(labels).toContain('Active energy');
    expect(HEALTH_METRICS.map((metric) => humanizeKey(metric))).toContain('Resting heart rate');
    expect(LOGGABLE_TYPES.map((type) => humanizeKey(type))).toStrictEqual([
      'Weight',
      'Height',
      'Body fat',
      'Blood pressure',
      'Blood glucose',
      'Body temperature',
      'Basal body temperature',
      'Oxygen saturation',
      'Resting heart rate',
      'Respiratory rate',
      'Hydration',
      'Nutrition',
      'Exercise session',
      'Sleep session',
      'Mindfulness session',
      'Menstruation flow',
      'Menstruation period',
      'Intermenstrual bleeding',
      'Cervical mucus',
      'Ovulation test',
      'Sexual activity',
    ]);
  });
});

describe('friendlyUnit', () => {
  it('writes the unit words every provider sends as symbols', () => {
    expect(friendlyUnit('percentage')).toBe('%');
    expect(friendlyUnit('Celsius')).toBe('°C');
    expect(friendlyUnit('μg/m3')).toBe('µg/m³');
    expect(friendlyUnit('mg/m3')).toBe('mg/m³');
    expect(friendlyUnit('ppm')).toBe('ppm');
    expect(friendlyUnit('constructor')).toBe('constructor');
  });

  it('has no unit for a missing or empty one', () => {
    expect(friendlyUnit(undefined)).toBeNull();
    expect(friendlyUnit('')).toBeNull();
  });
});

describe('humanizeEnum', () => {
  it('returns text with no words unchanged and keeps acronyms inside mixed text', () => {
    expect(humanizeEnum('---')).toBe('---');
    expect(humanizeEnum('')).toBe('');
    expect(humanizeEnum('hdmi_UHD_mode')).toBe('Hdmi UHD mode');
    expect(humanizeEnum('AUTO_MODE')).toBe('Auto mode');
  });
});
