import { describe, expect, it } from 'vitest';
import { CLIENT_PREFS, CLIENT_PREF_KEYS, RESERVED_LAYOUT_KEYS, layoutScopeOf } from '../../src';
import {
  AUTOMATION_CLIENT_PREFS,
  MAX_BREAKPOINTS_PER_AUTOMATION,
  MAX_RECENT_KINDS,
} from '../../src/automation-v3/prefs';

const AUTOMATION = '3f6c1f0e-1b7e-4c1c-9d0a-0f2f6b7a1a11';
const NODE = '8a1d5c52-2a8c-4b53-8f6b-5f0f3a9d7c22';
const KEYS = ['automations_editor', 'automations_palette', 'automations_breakpoints'] as const;

describe('automation preferences registration', () => {
  it('spreads the three profile entries into the client preference registry', () => {
    for (const key of KEYS) {
      expect(CLIENT_PREFS[key]).toBe(AUTOMATION_CLIENT_PREFS[key]);
      expect(CLIENT_PREF_KEYS).toContain(key);
      expect(CLIENT_PREFS[key].scope).toBe('profile');
      expect(layoutScopeOf(CLIENT_PREFS[key].storageKey)).toBe('profile');
      expect(RESERVED_LAYOUT_KEYS.has(CLIENT_PREFS[key].storageKey)).toBe(true);
    }
  });

  it('lists every key once and keeps storage keys unique', () => {
    expect(new Set(CLIENT_PREF_KEYS).size).toBe(CLIENT_PREF_KEYS.length);
    const storage = CLIENT_PREF_KEYS.map((key) => CLIENT_PREFS[key].storageKey);
    expect(new Set(storage).size).toBe(storage.length);
  });

  it('reads an absent preference as its default', () => {
    for (const key of KEYS) {
      const read = CLIENT_PREFS[key].decode(null);
      expect(read).toEqual({ status: 'absent', value: CLIENT_PREFS[key].defaultValue });
    }
  });
});

describe('automations_editor', () => {
  const definition = CLIENT_PREFS.automations_editor;

  it('defaults every device class to auto', () => {
    expect(definition.defaultValue).toEqual({
      view: { phone: 'auto', tablet: 'auto', desktop: 'auto' },
    });
  });

  it('round-trips a stored value', () => {
    const value = {
      view: { phone: 'outline', tablet: 'auto', desktop: 'canvas' },
    } as const;
    expect(definition.decode(definition.encode(value))).toEqual({
      status: 'stored',
      value,
      migrated: false,
    });
  });

  it('refuses an unknown view and unknown fields', () => {
    expect(
      definition.schema.safeParse({
        view: { phone: 'grid', tablet: 'auto', desktop: 'auto' },
      }).success,
    ).toBe(false);
    expect(definition.schema.safeParse({ ...definition.defaultValue, extra: 1 }).success).toBe(
      false,
    );
  });

  it('reports a stored value of another version as invalid', () => {
    expect(definition.decode({ version: 2, value: definition.defaultValue }).status).toBe(
      'invalid',
    );
  });
});

describe('automations_palette', () => {
  const schema = CLIENT_PREFS.automations_palette.schema;

  it('accepts kind ids', () => {
    expect(
      schema.safeParse({ recents: ['flow.if', 'device.set'], favourites: ['trigger.button'] })
        .success,
    ).toBe(true);
  });

  it('refuses text that is not a kind id', () => {
    expect(schema.safeParse({ recents: ['Flow If'], favourites: [] }).success).toBe(false);
    expect(schema.safeParse({ recents: [], favourites: ['flow'] }).success).toBe(false);
  });

  it('caps the recent list', () => {
    const many = Array.from({ length: MAX_RECENT_KINDS + 1 }, () => 'flow.if');
    expect(schema.safeParse({ recents: many, favourites: [] }).success).toBe(false);
  });
});

describe('automations_breakpoints', () => {
  const schema = CLIENT_PREFS.automations_breakpoints.schema;

  it('accepts step ids per automation', () => {
    expect(schema.safeParse({ byAutomation: { [AUTOMATION]: [NODE] } }).success).toBe(true);
    expect(schema.safeParse({ byAutomation: {} }).success).toBe(true);
  });

  it('refuses ids that are not uuids', () => {
    expect(schema.safeParse({ byAutomation: { nope: [NODE] } }).success).toBe(false);
    expect(schema.safeParse({ byAutomation: { [AUTOMATION]: ['n3'] } }).success).toBe(false);
  });

  it('caps breakpoints per automation and automations kept', () => {
    const many = Array.from({ length: MAX_BREAKPOINTS_PER_AUTOMATION + 1 }, () => NODE);
    expect(schema.safeParse({ byAutomation: { [AUTOMATION]: many } }).success).toBe(false);
    const automations = Object.fromEntries(
      Array.from({ length: 201 }, (_, index) => [
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        [],
      ]),
    );
    expect(schema.safeParse({ byAutomation: automations }).success).toBe(false);
  });
});
