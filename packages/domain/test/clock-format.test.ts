import { describe, expect, it } from 'vitest';
import { CLIENT_PREF_KEYS, CLIENT_PREFS, layoutScopeOf, localeClockFormat } from '../src';

describe('the clock format preference', () => {
  it('is kept per person and listed with the other preferences', () => {
    expect(CLIENT_PREFS.clock_format.scope).toBe('profile');
    expect(layoutScopeOf(CLIENT_PREFS.clock_format.storageKey)).toBe('profile');
    expect(CLIENT_PREF_KEYS).toContain('clock_format');
  });

  it('starts from the 12 or 24 hour convention of the locale', () => {
    const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
    expect(localeClockFormat()).toEqual({ hour24: hour12 === false });
  });

  it('stores only a 24-hour switch and refuses anything else', () => {
    const pref = CLIENT_PREFS.clock_format;
    expect(pref.decode(pref.encode({ hour24: false }))).toEqual({
      status: 'stored',
      value: { hour24: false },
      migrated: false,
    });
    expect(pref.decode({ version: 1, value: { hour24: 'yes' } }).status).toBe('invalid');
  });
});
