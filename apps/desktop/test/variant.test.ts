import { describe, expect, it } from 'vitest';
import { APP_START_URL, isAppOrigin, METRO_START_URL } from '../src/origin.js';
import { DESKTOP_VARIANTS, variantOfManifest } from '../src/variant.js';

describe('variantOfManifest', () => {
  it('reads a manifest without a variant as the release app', () => {
    expect(variantOfManifest('{"name":"@smarteverything/desktop"}')).toBe(DESKTOP_VARIANTS.release);
    expect(DESKTOP_VARIANTS.release.startUrl).toBe(APP_START_URL);
    expect(DESKTOP_VARIANTS.release.managedBy).toBeUndefined();
  });

  it('reads the development variant as a Metro-loaded app that leaves the server to the stable app', () => {
    const variant = variantOfManifest('{"variant":"development"}');
    expect(variant.productName).toBe('SmartEverything Dev');
    expect(variant.startUrl).toBe(METRO_START_URL);
    expect(variant.managedBy).toBe('stable-app');
  });

  it('refuses an unknown variant', () => {
    expect(() => variantOfManifest('{"variant":"beta"}')).toThrow();
  });
});

describe('isAppOrigin with a start URL', () => {
  it('trusts only the origin the variant loads', () => {
    expect(isAppOrigin('http://localhost:8081/settings', METRO_START_URL)).toBe(true);
    expect(isAppOrigin('http://localhost:8082/', METRO_START_URL)).toBe(false);
    expect(isAppOrigin('app://smarteverything/', METRO_START_URL)).toBe(false);
    expect(isAppOrigin('http://localhost:8081/')).toBe(false);
  });
});
