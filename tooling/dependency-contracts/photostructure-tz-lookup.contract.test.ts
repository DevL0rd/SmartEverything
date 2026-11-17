import tzLookup from '@photostructure/tz-lookup';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

describe('@photostructure/tz-lookup contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, '@photostructure/tz-lookup')).toBe(
      installedVersion('@photostructure/tz-lookup'),
    );
  });

  it('names the IANA zone of a place offline', () => {
    expect(tzLookup(13.7563, 100.5018)).toBe('Asia/Bangkok');
    expect(tzLookup(40.7128, -74.006)).toBe('America/New_York');
    expect(tzLookup(51.5072, -0.1276)).toBe('Europe/London');
  });

  it('names an hour zone over open sea', () => {
    expect(tzLookup(-40, -120)).toBe('Etc/GMT+8');
  });

  it('refuses coordinates outside the globe', () => {
    expect(() => tzLookup(91, 0)).toThrow();
    expect(() => tzLookup(0, Number.NaN)).toThrow();
  });
});
