import Holidays from 'date-holidays';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

describe('date-holidays contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'date-holidays')).toBe(installedVersion('date-holidays'));
  });

  it('names countries by ISO code in the requested language', () => {
    const countries = new Holidays().getCountries('en');

    expect(countries['DE']).toBe('Germany');
    expect(countries['US']).toBe('United States of America');
    expect(Object.keys(countries).length).toBeGreaterThan(100);
  });

  it('names the states of a country by code, and none for a country without states', () => {
    const rules = new Holidays();

    expect(rules.getStates('DE', 'en')['BY']).toBe('Bayern');
    expect(rules.getStates('SG', 'en')).toBeUndefined();
  });

  it('lists the public holidays of a state, which the public type filter separates from other kinds', () => {
    const rules = new Holidays('DE', 'BY', { languages: 'en' });
    const all = rules.getHolidays(2026);
    const publicOnly = all.filter((holiday) => holiday.type === 'public');

    expect(publicOnly.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(publicOnly.length);
    expect(publicOnly.find((holiday) => holiday.rule === '01-01')).toMatchObject({
      date: '2026-01-01 00:00:00',
      name: 'New Year’s Day',
      type: 'public',
    });
    expect(publicOnly.find((holiday) => holiday.rule === '12-25')?.date).toBe(
      '2026-12-25 00:00:00',
    );
  });

  it('returns nothing for a country it has no rules for', () => {
    expect(new Holidays('ZZ').getHolidays(2026)).toEqual([]);
  });
});
