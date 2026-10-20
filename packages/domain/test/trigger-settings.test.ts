import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRIGGER_SETTINGS,
  SETTINGS_ROW,
  TRIGGER_SETTINGS,
  TRIGGER_SETTINGS_CHANGE,
  applyTriggerSettingsChange,
  triggerKindEnabled,
  triggerKindKey,
  triggerSourceEnabled,
} from '../src';

const PLAIN = { kind: 'state' };
const PRIVATE = { kind: 'notification_text', optIn: true };

describe('trigger switches', () => {
  it('has every source and kind on by default', () => {
    expect(triggerSourceEnabled(DEFAULT_TRIGGER_SETTINGS, 'device')).toBe(true);
    expect(triggerKindEnabled(DEFAULT_TRIGGER_SETTINGS, 'device', PLAIN)).toBe(true);
  });

  it('keeps privacy kinds off until the owner switches them on', () => {
    expect(triggerKindEnabled(DEFAULT_TRIGGER_SETTINGS, 'phone', PRIVATE)).toBe(false);
    const on = { sources: {}, kinds: { 'phone/notification_text': true } };
    expect(triggerKindEnabled(on, 'phone', PRIVATE)).toBe(true);
  });

  it('turns every kind of a source off with the source switch, even an opted-in one', () => {
    const off = { sources: { phone: false }, kinds: { 'phone/notification_text': true } };
    expect(triggerKindEnabled(off, 'phone', PRIVATE)).toBe(false);
    expect(triggerKindEnabled(off, 'phone', PLAIN)).toBe(false);
    expect(triggerKindEnabled(off, 'device', PLAIN)).toBe(true);
  });

  it('turns one kind off without touching its siblings', () => {
    const off = { sources: {}, kinds: { [triggerKindKey('device', 'state')]: false } };
    expect(triggerKindEnabled(off, 'device', PLAIN)).toBe(false);
    expect(triggerKindEnabled(off, 'device', { kind: 'online' })).toBe(true);
  });
});

describe('trigger settings change', () => {
  it('sets, replaces and removes overrides', () => {
    const first = applyTriggerSettingsChange(DEFAULT_TRIGGER_SETTINGS, {
      sources: { device: false },
      kinds: { 'event/doorbell': false },
    });
    expect(first).toStrictEqual({
      sources: { device: false },
      kinds: { 'event/doorbell': false },
    });
    const second = applyTriggerSettingsChange(first, {
      sources: { device: null, computer: false },
    });
    expect(second).toStrictEqual({
      sources: { computer: false },
      kinds: { 'event/doorbell': false },
    });
  });

  it('refuses an empty change and malformed names', () => {
    expect(TRIGGER_SETTINGS_CHANGE.safeParse({}).success).toBe(false);
    expect(TRIGGER_SETTINGS_CHANGE.safeParse({ kinds: { doorbell: false } }).success).toBe(false);
    expect(TRIGGER_SETTINGS_CHANGE.safeParse({ sources: { Device: false } }).success).toBe(false);
    expect(TRIGGER_SETTINGS_CHANGE.safeParse({ kinds: { 'event/doorbell': null } }).success).toBe(
      true,
    );
  });

  it('is stored on the settings row with a default for rows written before it existed', () => {
    expect(TRIGGER_SETTINGS.parse(DEFAULT_TRIGGER_SETTINGS)).toStrictEqual(
      DEFAULT_TRIGGER_SETTINGS,
    );
    const shape = SETTINGS_ROW.shape.trigger_settings;
    expect(shape.parse(undefined)).toStrictEqual(DEFAULT_TRIGGER_SETTINGS);
  });
});
